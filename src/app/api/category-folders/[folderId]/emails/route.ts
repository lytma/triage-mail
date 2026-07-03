import { handle, json } from "@/server/lib/http";
import { requireUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/category-folders/:folderId/emails — paginated, filterable by
 * sender, date range, source mailbox, and low-confidence flag.
 * `folderId` may be a UUID or a slug for convenience.
 */
export async function GET(req: Request, { params }: { params: Promise<{ folderId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { folderId } = await params;
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(folderId);
    const folder = await prisma.categoryFolder.findFirst({
      where: isUuid
        ? { id: folderId, userAccountId: user.id }
        : { slug: folderId, userAccountId: user.id },
    });
    if (!folder) throw new HttpError(404, "Folder not found");

    const where: Prisma.EmailMetadataWhereInput = {
      userAccountId: user.id,
      categoryFolderId: folder.id,
      isArchived: false,
    };
    const sender = url.searchParams.get("sender");
    if (sender) where.senderEmail = { contains: sender, mode: "insensitive" };
    const mailbox = url.searchParams.get("mailboxId");
    if (mailbox) where.connectedMailboxId = mailbox;
    if (url.searchParams.get("flaggedOnly") === "true") where.isFlaggedLowConfidence = true;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from || to) {
      where.receivedAt = {};
      if (from) (where.receivedAt as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.receivedAt as Prisma.DateTimeFilter).lte = new Date(to);
    }

    const [rows, total] = await Promise.all([
      prisma.emailMetadata.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          triageDecision: { select: { reason: true, confidenceScore: true } },
          connectedMailbox: { select: { provider: true, emailAddress: true } },
        },
      }),
      prisma.emailMetadata.count({ where }),
    ]);

    return json({
      folder: { id: folder.id, name: folder.name, slug: folder.slug },
      items: rows.map((r) => ({
        id: r.id,
        senderEmail: r.senderEmail,
        senderName: r.senderName,
        subject: r.subject,
        receivedAt: r.receivedAt,
        provider: r.connectedMailbox.provider,
        mailboxEmail: r.connectedMailbox.emailAddress,
        isFlaggedLowConfidence: r.isFlaggedLowConfidence,
        isArchived: r.isArchived,
        hasAttachments: r.hasAttachments,
        triageReason: r.triageDecision?.reason ?? null,
        triageConfidence: r.triageDecision ? Number(r.triageDecision.confidenceScore) : null,
      })),
      total,
      page,
    });
  });
}
