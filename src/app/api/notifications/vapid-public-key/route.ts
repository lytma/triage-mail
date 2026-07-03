import { handle, json } from "@/server/lib/http";
import { requireUser } from "@/server/lib/session";
import { getVapidKeys } from "@/server/lib/vapid";

export const dynamic = "force-dynamic";

/** GET /api/notifications/vapid-public-key */
export async function GET() {
  return handle(async () => {
    await requireUser();
    return json({ vapidPublicKey: getVapidKeys().publicKey });
  });
}
