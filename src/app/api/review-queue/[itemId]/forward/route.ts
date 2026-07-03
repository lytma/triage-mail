import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { track } from "@/server/lib/analytics";
import { mailboxActionQueue } from "@/server/queues/queues";

export const dynamic = "force-dynamic";

const schema = z.object({
  to: z.array(z.string()).min(1),
  cc: z.array(z.string()).optional(),
  body: z.string().optional(),
});

/**
 * POST /api/review-queue/:itemId/forward — forward via the source mailbox and
 * mark the item "forwarded" (does NOT clear it from the queue).
 */
export async function POST(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { itemId } = await params;
    const input = schema.parse(await req.json());

    const item = await prisma.reviewQueueItem.findFirst({
      where: { id: itemId, userAccountId: user.id },
      include: { emailMetadata: true },
    });
    if (!item) throw new HttpError(404, "Not found");

    const em = item.emailMetadata;
    const subject = em.subject?.startsWith("Fw:") ? em.subject : `Fw: ${em.subject ?? ""}`;

    await prisma.reviewQueueItem.update({
      where: { id: item.id },
      data: { status: "forwarded" },
    });

    if (user.isDemo) {
      await track("item_forwarded", { demo: true }, user.id);
      return json({ sentMessageId: "demo", syncedToProvider: false, demo: true });
    }

    await mailboxActionQueue().add("forward", {
      userAccountId: user.id,
      connectedMailboxId: em.connectedMailboxId,
      action: "forward",
      emailMetadataId: em.id,
      providerMessageId: em.providerMessageId,
      providerThreadId: em.providerThreadId ?? undefined,
      payload: { to: input.to, cc: input.cc, subject, body: input.body ?? "" },
    });
    await track("item_forwarded", {}, user.id);
    return json({ sentMessageId: `queued-${item.id}`, syncedToProvider: true });
  });
}
