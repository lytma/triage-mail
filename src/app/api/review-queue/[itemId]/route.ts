import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { track } from "@/server/lib/analytics";
import { mailboxActionQueue } from "@/server/queues/queues";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["archived", "done", "pending"]),
});

/**
 * PATCH /api/review-queue/:itemId — archive or mark done (clears the item).
 * Archiving two-way syncs to the source mailbox (enqueue mailbox-action);
 * "done" leaves the provider mail untouched. "pending" supports Undo.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { itemId } = await params;
    const body = patchSchema.parse(await req.json());

    const item = await prisma.reviewQueueItem.findFirst({
      where: { id: itemId, userAccountId: user.id },
      include: { emailMetadata: { include: { connectedMailbox: true } } },
    });
    if (!item) throw new HttpError(404, "Not found");

    if (body.status === "pending") {
      // Undo: restore to the queue.
      const updated = await prisma.reviewQueueItem.update({
        where: { id: item.id },
        data: { status: "pending", clearedAt: null },
      });
      if (item.emailMetadata.isArchived) {
        await prisma.emailMetadata.update({
          where: { id: item.emailMetadataId },
          data: { isArchived: false },
        });
      }
      return json({ id: updated.id, status: updated.status, clearedAt: updated.clearedAt });
    }

    const clearedAt = new Date();
    const updated = await prisma.reviewQueueItem.update({
      where: { id: item.id },
      data: { status: body.status, clearedAt },
    });

    if (body.status === "archived") {
      await prisma.emailMetadata.update({
        where: { id: item.emailMetadataId },
        data: { isArchived: true },
      });
      // Two-way sync archive to provider (skip for demo).
      if (!user.isDemo) {
        await mailboxActionQueue().add("archive", {
          userAccountId: user.id,
          connectedMailboxId: item.emailMetadata.connectedMailboxId,
          action: "archive",
          emailMetadataId: item.emailMetadataId,
          providerMessageId: item.emailMetadata.providerMessageId,
        });
      }
    }

    // Increment today's queue-cleared stat (inline; avoids cross-module coupling).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.triageSummaryStat.upsert({
      where: { uq_stats_user_date: { userAccountId: user.id, statDate: today } },
      update: { queueClearedCount: { increment: 1 } },
      create: { userAccountId: user.id, statDate: today, queueClearedCount: 1 },
    });

    await track("review_queue_cleared", { clear_action: body.status }, user.id);

    return json({ id: updated.id, status: updated.status, clearedAt: updated.clearedAt });
  });
}
