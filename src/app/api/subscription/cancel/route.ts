import { handle, json } from "@/server/lib/http";
import { requireRealUser } from "@/server/lib/session";
import { cancelSubscription } from "@/server/services/billing";

export const dynamic = "force-dynamic";

/** POST /api/subscription/cancel — cancel at period end. */
export async function POST() {
  return handle(async () => {
    const user = await requireRealUser();
    await cancelSubscription(user.id);
    return json({ status: "canceled", canceledAt: new Date().toISOString() });
  });
}
