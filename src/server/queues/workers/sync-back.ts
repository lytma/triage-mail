import type { Job } from "bullmq";
import { prisma } from "@/server/db/prisma";
import type { SyncBackJobData } from "@/server/queues/queues";
import { getProvider } from "@/server/providers";
import { triageQueue } from "@/server/queues/queues";

/**
 * Sync-back worker: polls a mailbox for new messages since its cursor and
 * enqueues a triage job for each. Safe/no-op in preview stub mode — it only
 * updates lastSyncedAt.
 */
export async function processSyncBack(job: Job<SyncBackJobData>): Promise<unknown> {
  const { connectedMailboxId } = job.data;
  const mailbox = await prisma.connectedMailbox.findUnique({
    where: { id: connectedMailboxId },
  });
  if (!mailbox) {
    throw new Error(`ConnectedMailbox ${connectedMailboxId} not found`);
  }

  if (mailbox.syncState === "disconnected" || mailbox.syncState === "paused") {
    console.log(
      `[worker:sync-back] mailbox ${mailbox.id} is ${mailbox.syncState}; skipping.`,
    );
    return { skipped: true, state: mailbox.syncState };
  }

  const provider = getProvider(mailbox.provider);
  const { messages, cursor } = await provider.listRecentMessages(
    mailbox,
    mailbox.providerHistoryId ?? undefined,
  );

  // Stub mode returns [] — this loop no-ops in preview.
  let enqueued = 0;
  for (const m of messages) {
    await triageQueue().add("triage", {
      userAccountId: mailbox.userAccountId,
      connectedMailboxId: mailbox.id,
      providerMessageId: m.providerMessageId,
    });
    enqueued += 1;
  }

  await prisma.connectedMailbox.update({
    where: { id: mailbox.id },
    data: {
      lastSyncedAt: new Date(),
      providerHistoryId: cursor || mailbox.providerHistoryId,
      lastSyncError: null,
    },
  });

  return { enqueued, cursor };
}
