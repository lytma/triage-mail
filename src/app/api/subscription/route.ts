import { handle, json } from "@/server/lib/http";
import { requireRealUser } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

/** GET /api/subscription — current subscription status + billing details. */
export async function GET() {
  return handle(async () => {
    const user = await requireRealUser();
    const [account, sub] = await Promise.all([
      prisma.userAccount.findUnique({ where: { id: user.id } }),
      prisma.subscription.findUnique({ where: { userAccountId: user.id } }),
    ]);
    return json({
      plan: sub?.plan ?? account?.subscriptionPlan ?? null,
      status: account?.subscriptionStatus ?? "trialing",
      currentPeriodStart: sub?.currentPeriodStart ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      trialEndsAt: account?.trialEndsAt ?? null,
    });
  });
}
