import { handle, json } from "@/server/lib/http";
import { HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { track } from "@/server/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/demo/:demoToken — public demo access (no signup). Returns the demo
 * account summary + a preview of its Review queue and category folders.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ demoToken: string }> }) {
  return handle(async () => {
    const { demoToken } = await params;
    const demo = await prisma.demoAccount.findUnique({ where: { demoToken } });
    if (!demo || !demo.isActive) throw new HttpError(404, "Demo not found");

    const user = await prisma.userAccount.findFirst({ where: { isDemo: true, email: "demo@triagemail.app" } });
    if (!user) throw new HttpError(404, "Demo not seeded");

    const [reviewQueue, folders] = await Promise.all([
      prisma.reviewQueueItem.findMany({
        where: { userAccountId: user.id, status: "pending" },
        orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }],
        take: 15,
        include: { emailMetadata: { include: { triageDecision: true } } },
      }),
      prisma.categoryFolder.findMany({
        where: { userAccountId: user.id },
        orderBy: { displayOrder: "asc" },
      }),
    ]);

    await track("demo_account_opened", {}, null);

    return json({
      demoAccount: { id: demo.id, displayName: demo.displayName },
      reviewQueue: reviewQueue.map((r) => ({
        id: r.id,
        senderEmail: r.emailMetadata.senderEmail,
        senderName: r.emailMetadata.senderName,
        subject: r.emailMetadata.subject,
        receivedAt: r.emailMetadata.receivedAt,
        importanceScore: Number(r.importanceScore),
        triageReason: r.emailMetadata.triageDecision?.reason ?? null,
        triageConfidence: r.emailMetadata.triageDecision
          ? Number(r.emailMetadata.triageDecision.confidenceScore)
          : null,
      })),
      categoryFolders: folders.map((f) => ({ id: f.id, name: f.name, slug: f.slug })),
    });
  });
}
