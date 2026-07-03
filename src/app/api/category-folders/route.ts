import { handle, json } from "@/server/lib/http";
import { requireUser } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

/** GET /api/category-folders — list folders with unarchived item counts. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const folders = await prisma.categoryFolder.findMany({
      where: { userAccountId: user.id },
      orderBy: { displayOrder: "asc" },
    });
    const counts = await prisma.emailMetadata.groupBy({
      by: ["categoryFolderId"],
      where: { userAccountId: user.id, isArchived: false, categoryFolderId: { not: null } },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.categoryFolderId, c._count._all]));
    return json({
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        displayOrder: f.displayOrder,
        itemCount: countMap.get(f.id) ?? 0,
      })),
    });
  });
}
