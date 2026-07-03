import type { Job } from "bullmq";
import { prisma } from "@/server/db/prisma";
import type { MailboxActionJobData } from "@/server/queues/queues";
import { getProvider } from "@/server/providers";

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
