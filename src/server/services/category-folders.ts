import { prisma } from "@/server/db/prisma";

/** Fixed default category catalog (PRD: users cannot create custom categories in v1). */
export const DEFAULT_CATEGORIES: {
  slug: string;
  name: string;
  displayOrder: number;
}[] = [
  { slug: "fyi", name: "FYI", displayOrder: 1 },
  { slug: "newsletters", name: "Newsletters", displayOrder: 2 },
  { slug: "marketing", name: "Marketing", displayOrder: 3 },
  { slug: "receipts", name: "Receipts", displayOrder: 4 },
  { slug: "automated_notifications", name: "Automated Notifications", displayOrder: 5 },
];

/** Map a Classification enum value to the category folder slug it files into. */
export const CLASSIFICATION_TO_SLUG: Record<string, string> = {
  fyi: "fyi",
  newsletter: "newsletters",
  marketing: "marketing",
  receipt: "receipts",
  automated_notification: "automated_notifications",
  // "important" has no folder — it goes to the Review queue.
};

/** Idempotently seed the fixed category folders for a user. */
export async function seedCategoryFolders(userAccountId: string): Promise<void> {
  for (const c of DEFAULT_CATEGORIES) {
    await prisma.categoryFolder.upsert({
      where: { uq_categories_user_slug: { userAccountId, slug: c.slug } },
      update: {},
      create: {
        userAccountId,
        slug: c.slug,
        name: c.name,
        isSystemDefault: true,
        displayOrder: c.displayOrder,
      },
    });
  }
}

export async function getFolderIdForClassification(
  userAccountId: string,
  classification: string,
): Promise<string | null> {
  const slug = CLASSIFICATION_TO_SLUG[classification];
  if (!slug) return null;
  const folder = await prisma.categoryFolder.findUnique({
    where: { uq_categories_user_slug: { userAccountId, slug } },
  });
  return folder?.id ?? null;
}
