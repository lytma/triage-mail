import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { AppSidebar, type SidebarFolder } from "@/components/app-sidebar";
import { ReconnectBanner } from "@/components/reconnect-banner";
import { Toaster } from "@/components/ui/toaster";
import { DEFAULT_CATEGORIES } from "@/server/services/category-folders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  const [folders, disconnected, reviewCount] = await Promise.all([
    prisma.categoryFolder.findMany({
      where: { userAccountId: user.id },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.connectedMailbox.findMany({
      where: { userAccountId: user.id, syncState: { in: ["disconnected", "error"] } },
      select: { id: true, emailAddress: true, provider: true },
    }),
    prisma.reviewQueueItem.count({
      where: { userAccountId: user.id, status: { in: ["pending", "replied", "forwarded"] } },
    }),
  ]);

  // Item counts per folder (unarchived).
  const counts = await prisma.emailMetadata.groupBy({
    by: ["categoryFolderId"],
    where: { userAccountId: user.id, isArchived: false, categoryFolderId: { not: null } },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.categoryFolderId, c._count._all]));

  const sidebarFolders: SidebarFolder[] = (
    folders.length ? folders : DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: String(i), userAccountId: user.id }))
  ).map((f) => ({
    slug: f.slug,
    name: f.name,
    itemCount: countMap.get((f as { id: string }).id) ?? 0,
  }));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        folders={sidebarFolders}
        reviewCount={reviewCount}
        isAdmin={user.isAdmin}
        userEmail={user.email}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <ReconnectBanner mailboxes={disconnected} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
