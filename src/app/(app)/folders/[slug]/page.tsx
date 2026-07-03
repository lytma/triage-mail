import type { Metadata } from "next";
import { getSessionUser } from "@/server/lib/session";
import { CategoryFolderView } from "@/components/folders/category-folder-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Category folder · Triage Mail",
};

export default async function FolderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, user] = await Promise.all([params, getSessionUser()]);
  return (
    <div className="h-full min-h-0">
      <CategoryFolderView slug={slug} isDemo={Boolean(user?.isDemo)} />
    </div>
  );
}
