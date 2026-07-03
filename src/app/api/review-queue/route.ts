import { handle, json } from "@/server/lib/http";
import { requireUser } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { track } from "@/server/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/review-queue — pending important items ordered by importance DESC
 * then recency DESC.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

    const where = { userAccountId: user.id, status: "pending" as const };
    const [rows, total] = await Promise.all([
      prisma.reviewQueueItem.findMany({
        where,
        orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          emailMetadata: {
            include: { triageDecision: true, connectedMailbox: { select: { provider: true, emailAddress: true } } },
          },
        },
      }),
      prisma.reviewQueueItem.count({ where }),
    ]);

    await track("review_queue_opened", { count: total }, user.id);

    const items = rows.map((r) => ({
      id: r.id,
      emailMetadataId: r.emailMetadataId,
      status: r.status,
      senderEmail: r.emailMetadata.senderEmail,
      senderName: r.emailMetadata.senderName,
      subject: r.emailMetadata.subject,
      receivedAt: r.emailMetadata.receivedAt,
      provider: r.emailMetadata.connectedMailbox.provider,
      mailboxEmail: r.emailMetadata.connectedMailbox.emailAddress,
      hasAttachments: r.emailMetadata.hasAttachments,
      importanceScore: Number(r.importanceScore),
      isFlaggedLowConfidence: r.emailMetadata.isFlaggedLowConfidence,
      triageReason: r.emailMetadata.triageDecision?.reason ?? null,
      triageConfidence: r.emailMetadata.triageDecision
        ? Number(r.emailMetadata.triageDecision.confidenceScore)
        : null,
      threadId: r.emailMetadata.providerThreadId,
    }));

    return json({ items, total, page });
  });
}
