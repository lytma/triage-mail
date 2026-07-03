import { prisma } from "@/server/db/prisma";
import { HttpError } from "./session";

/**
 * Tenant isolation helpers.
 *
 * Every tenant-scoped query MUST filter by the session user's id. These helpers
 * make that explicit and hard to forget. Cross-tenant reads therefore return no
 * rows, and cross-tenant writes throw before touching another user's data.
 */

/** Merge a mandatory userAccountId filter into a Prisma `where` clause. */
export function scopedWhere<T extends Record<string, unknown>>(
  userAccountId: string,
  where?: T,
): T & { userAccountId: string } {
  return { ...(where ?? ({} as T)), userAccountId };
}

/**
 * Assert that a row identified by `id` belongs to `userAccountId`.
 * Throws 404 if it does not exist for this tenant (never leaks existence).
 */
export async function assertOwned(
  model:
    | "emailMetadata"
    | "reviewQueueItem"
    | "triageRule"
    | "connectedMailbox"
    | "categoryFolder"
    | "notificationSubscription",
  id: string,
  userAccountId: string,
): Promise<void> {
  // @ts-expect-error dynamic model access is intentional and type-narrowed above
  const row = await prisma[model].findFirst({
    where: { id, userAccountId },
    select: { id: true },
  });
  if (!row) throw new HttpError(404, "Not found");
}
