import type { Job } from "bullmq";
import type { ConnectedMailbox } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { MailboxActionJobData } from "@/server/queues/queues";
import { getProvider, type ProviderAdapter } from "@/server/providers";

/**
 * Mailbox-action worker: performs two-way-sync side effects on the provider
 * (archive / send / reply / forward). Auth failures flip the mailbox to
 * 'disconnected' so the Reconnect banner surfaces; other errors rethrow for
 * BullMQ retry/backoff (dead-letters after 5 attempts).
 */

function isAuthError(err: unknown): boolean {
  const e = err as { code?: number | string; status?: number; message?: string };
  const status = Number(e?.status ?? e?.code);
  if (status === 401 || status === 403) return true;
  const msg = (e?.message ?? "").toLowerCase();
  return (
    msg.includes("invalid_grant") ||
    msg.includes("unauthorized") ||
    msg.includes("token") && msg.includes("expired") ||
    msg.includes("authentication")
  );
}

export async function processMailboxAction(
  job: Job<MailboxActionJobData>,
): Promise<unknown> {
  const data = job.data;
  const mailbox = await prisma.connectedMailbox.findUnique({
    where: { id: data.connectedMailboxId },
  });
  if (!mailbox) {
    throw new Error(`ConnectedMailbox ${data.connectedMailboxId} not found`);
  }

  const provider = getProvider(mailbox.provider);

  try {
    if (data.action === "archive") {
      if (!data.providerMessageId) {
        throw new Error("archive action requires providerMessageId");
      }
      await provider.archiveMessage(mailbox, data.providerMessageId);
      return { archived: data.providerMessageId };
    }

    if (data.action === "unsubscribe") {
      return await performUnsubscribe(data, mailbox, provider);
    }

    // send / reply / forward
    const payload = data.payload ?? {};
    const sent = await provider.sendMessage(mailbox, {
      to: payload.to ?? [],
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      body: payload.body,
      inReplyTo: payload.inReplyTo,
      threadId: data.providerThreadId,
    });
    return { action: data.action, sentId: sent.id };
  } catch (err) {
    if (isAuthError(err)) {
      await prisma.connectedMailbox.update({
        where: { id: mailbox.id },
        data: {
          syncState: "disconnected",
          lastSyncError: `Auth failed during ${data.action}: ${
            (err as Error).message
          }`,
        },
      });
      // Do not retry an auth failure — reconnect is required.
      console.error(
        `[worker:mailbox-action] auth failure on mailbox ${mailbox.id}; marked disconnected.`,
      );
      return { disconnected: true };
    }
    throw err;
  }
}

/**
 * One-click unsubscribe. Uses the parsed List-Unsubscribe target:
 *  - RFC 8058 one-click → HTTPS POST with `List-Unsubscribe=One-Click`
 *  - other HTTPS link   → HTTPS GET
 *  - mailto: target     → send an unsubscribe email via the mailbox
 * Then archives the message. Unsubscribe is best-effort: a failed HTTP call is
 * logged but does not throw (senders' endpoints are unreliable).
 */
async function performUnsubscribe(
  data: MailboxActionJobData,
  mailbox: ConnectedMailbox,
  provider: ProviderAdapter,
): Promise<unknown> {
  if (!data.emailMetadataId) {
    throw new Error("unsubscribe action requires emailMetadataId");
  }
  const email = await prisma.emailMetadata.findFirst({
    where: { id: data.emailMetadataId, userAccountId: data.userAccountId },
    select: {
      unsubscribeTarget: true,
      unsubscribeOneClick: true,
      providerMessageId: true,
    },
  });
  if (!email?.unsubscribeTarget) {
    return { unsubscribed: false, reason: "no unsubscribe target" };
  }

  const target = email.unsubscribeTarget;
  try {
    if (/^https?:\/\//i.test(target)) {
      if (email.unsubscribeOneClick) {
        await fetch(target, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
        });
      } else {
        await fetch(target, { method: "GET" });
      }
    } else if (/^mailto:/i.test(target)) {
      const { address, subject } = parseMailto(target);
      if (address) {
        await provider.sendMessage(mailbox, {
          to: [address],
          subject: subject || "unsubscribe",
          body: "unsubscribe",
        });
      }
    }
  } catch (err) {
    console.error(
      `[worker:mailbox-action] unsubscribe request failed (best-effort): ${
        (err as Error).message
      }`,
    );
  }

  // Archive the message so it leaves the folder (best-effort, guarded above).
  if (email.providerMessageId) {
    try {
      await provider.archiveMessage(mailbox, email.providerMessageId);
    } catch (err) {
      if (isAuthError(err)) throw err;
      console.error(
        `[worker:mailbox-action] post-unsubscribe archive failed: ${
          (err as Error).message
        }`,
      );
    }
  }

  return { unsubscribed: true, target };
}

/** Parse a `mailto:addr?subject=...` URI into address + subject. */
function parseMailto(uri: string): { address: string; subject: string } {
  const withoutScheme = uri.replace(/^mailto:/i, "");
  const [addr, query] = withoutScheme.split("?");
  let subject = "";
  if (query) {
    const params = new URLSearchParams(query);
    subject = params.get("subject") ?? "";
  }
  return { address: addr.trim(), subject };
}
