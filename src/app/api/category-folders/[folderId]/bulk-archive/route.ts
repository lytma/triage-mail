import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { track } from "@/server/lib/analytics";
import { mailboxActionQueue } from "@/server/queues/queues";

export const dynamic = "force-dynamic";

const schema = z.object({ emailMetadataIds: z.array(z.string().uuid()).min(1) });

/**
 * POST /api/category-folders/:folderId/bulk-archive — archive selected items
 * and two-way sync each to its source mailbox.
 */
export async function POST(req: Request, { params }: { params: Promise<{ folderId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { folderId } = await params;
    const { emailMetadataIds } = schema.parse(await req.json());

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(folderId);
    const folder = await prisma.categoryFolder.findFirst({
      where: isUuid
        ? { id: folderId, userAccountId: user.id }
        : { slug: folderId, userAccountId: user.id },
    });
    if (!folder) throw new HttpError(404, "Folder not found");

    // Only archive rows that belong to this user + folder (tenant scoped).
    const emails = await prisma.emailMetadata.findMany({
      where: {
        id: { in: emailMetadataIds },
        userAccountId: user.id,
        categoryFolderId: folder.id,
      },
      select: { id: true, connectedMailboxId: true, providerMessageId: true },
    });

    await prisma.emailMetadata.updateMany({
      where: { id: { in: emails.map((e) => e.id) }, userAccountId: user.id },
      data: { isArchived: true },
    });

    if (!user.isDemo) {
      for (const e of emails) {
        await mailboxActionQueue().add("archive", {
          userAccountId: user.id,
          connectedMailboxId: e.connectedMailboxId,
          action: "archive",
          emailMetadataId: e.id,
          providerMessageId: e.providerMessageId,
        });
      }
    }

    await track("category_bulk_archived", { category: folder.slug, count: emails.length }, user.id);
    return json({ archivedCount: emails.length, syncedToProvider: !user.isDemo });
  });
}
