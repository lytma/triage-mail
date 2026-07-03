import { auth } from "./auth";
import { prisma } from "@/server/db/prisma";
import type { UserAccount } from "@prisma/client";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  isDemo: boolean;
  isAdmin: boolean;
  subscriptionStatus: string;
}

/** Returns the current session user (lightweight, from the JWT) or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    displayName: session.user.name ?? "",
    isDemo: Boolean(session.user.isDemo),
    isAdmin: Boolean(session.user.isAdmin),
    subscriptionStatus: session.user.subscriptionStatus ?? "trialing",
  };
}

/** Throws 401-style error if not authenticated. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Unauthorized");
  return user;
}

/** Requires a real (non-demo) user — used for provider/billing/mutating endpoints. */
export async function requireRealUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.isDemo) throw new HttpError(403, "Not available in demo mode");
  return user;
}

/** Loads the full UserAccount row for the current session, scoped by id. */
export async function getCurrentUserAccount(): Promise<UserAccount | null> {
  const u = await getSessionUser();
  if (!u) return null;
  return prisma.userAccount.findUnique({ where: { id: u.id } });
}
