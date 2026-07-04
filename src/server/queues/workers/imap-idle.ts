import { prisma } from "@/server/db/prisma";
import { decryptToken } from "@/server/lib/crypto";
import { detectImapSettings } from "@/server/lib/imap-config";
import { isPlaceholderToken } from "@/server/providers/types";
import { syncBackQueue } from "@/server/queues/queues";

/**
 * IMAP near-real-time watcher.
 *
 * Gmail/Outlook get provider push; IMAP has no equivalent, so for each active
 * IMAP mailbox we open a long-lived connection and use IMAP IDLE where the
 * server supports it (near-real-time), falling back to periodic polling where
 * it does not. Either way, when new mail is detected we enqueue a `sync-back`
 * job — the same path push-driven mailboxes use — which lists new messages and
 * enqueues triage.
 *
 * Runs only in the worker tier. Mailboxes with a placeholder app password
 * (preview stub mode) can't connect and are skipped, so this is a no-op in
 * preview.
 */

const POLL_FALLBACK_MS = 60_000; // when the server lacks IDLE
const RESCAN_MS = 5 * 60_000; // pick up newly connected IMAP mailboxes
const RECONNECT_DELAY_MS = 15_000;

interface Watcher {
  mailboxId: string;
  stop: () => Promise<void>;
}

const watchers = new Map<string, Watcher>();
let rescanTimer: NodeJS.Timeout | null = null;

async function enqueueSync(mailboxId: string): Promise<void> {
  await syncBackQueue().add("imap-idle", { connectedMailboxId: mailboxId });
}

async function runWatcher(mailboxId: string): Promise<Watcher> {
  let stopped = false;
  let client: { logout(): Promise<void>; close?: () => void } | null = null;
  let pollTimer: NodeJS.Timeout | null = null;

  const cleanup = async () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    const c = client;
    client = null;
    if (c) await c.logout().catch(() => c.close?.());
  };

  const loop = async () => {
    while (!stopped) {
      try {
        const mailbox = await prisma.connectedMailbox.findUnique({
          where: { id: mailboxId },
        });
        if (!mailbox || mailbox.provider !== "imap" || mailbox.syncState !== "active") {
          return; // watcher no longer applies
        }
        const pass = decryptToken(mailbox.oauthRefreshTokenEncrypted ?? "");
        if (isPlaceholderToken(pass)) return; // preview stub — nothing to watch

        const { ImapFlow } = await import("imapflow");
        const s = detectImapSettings(mailbox.emailAddress);
        const c = new ImapFlow({
          host: s.imapHost,
          port: s.imapPort,
          secure: s.imapSecure,
          auth: { user: mailbox.emailAddress, pass },
          logger: false,
        });
        client = c as unknown as { logout(): Promise<void>; close?: () => void };

        await c.connect();
        await c.mailboxOpen("INBOX");

        // New-message signal → enqueue a sync-back (dedupe/idempotency handled downstream).
        c.on("exists", () => {
          void enqueueSync(mailboxId);
        });
        c.on("error", () => {
          /* handled by the outer reconnect loop */
        });

        const supportsIdle = Boolean(
          (c as unknown as { capabilities?: Map<string, unknown> }).capabilities?.has?.(
            "IDLE",
          ),
        );

        if (supportsIdle) {
          console.log(`[imap-idle] IDLE watching ${mailbox.emailAddress}`);
          // imapflow keeps the connection in IDLE while no other command runs;
          // await idle() resolves when the connection drops → reconnect.
          await (c as unknown as { idle(): Promise<void> }).idle();
        } else {
          console.log(`[imap-idle] polling ${mailbox.emailAddress} (no IDLE)`);
          await new Promise<void>((resolve) => {
            pollTimer = setInterval(() => void enqueueSync(mailboxId), POLL_FALLBACK_MS);
            const check = setInterval(async () => {
              if (stopped) {
                clearInterval(check);
                resolve();
              }
            }, 1000);
          });
        }
      } catch (err) {
        console.error(
          `[imap-idle] watcher for ${mailboxId} error: ${(err as Error).message}`,
        );
      } finally {
        await cleanup();
      }
      if (!stopped) await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
    }
  };

  void loop();

  return {
    mailboxId,
    stop: async () => {
      stopped = true;
      await cleanup();
    },
  };
}

async function rescan(): Promise<void> {
  const mailboxes = await prisma.connectedMailbox.findMany({
    where: { provider: "imap", syncState: "active" },
    select: { id: true, oauthRefreshTokenEncrypted: true },
  });
  const activeIds = new Set<string>();
  for (const m of mailboxes) {
    // Skip stub (placeholder) mailboxes — nothing to watch in preview.
    if (isPlaceholderToken(decryptToken(m.oauthRefreshTokenEncrypted ?? ""))) continue;
    activeIds.add(m.id);
    if (!watchers.has(m.id)) {
      watchers.set(m.id, await runWatcher(m.id));
    }
  }
  // Stop watchers for mailboxes that disappeared or were disconnected.
  for (const [id, w] of watchers) {
    if (!activeIds.has(id)) {
      await w.stop();
      watchers.delete(id);
    }
  }
}

/** Start the IMAP IDLE/poll watchers (called once from the worker entrypoint). */
export async function startImapWatchers(): Promise<void> {
  await rescan().catch((err) =>
    console.error("[imap-idle] initial rescan failed:", (err as Error).message),
  );
  rescanTimer = setInterval(() => void rescan(), RESCAN_MS);
}

/** Stop all watchers (worker shutdown). */
export async function stopImapWatchers(): Promise<void> {
  if (rescanTimer) clearInterval(rescanTimer);
  rescanTimer = null;
  await Promise.all([...watchers.values()].map((w) => w.stop()));
  watchers.clear();
}
