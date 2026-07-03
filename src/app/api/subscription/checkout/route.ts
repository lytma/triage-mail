import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireRealUser } from "@/server/lib/session";
import { originFromRequest } from "@/server/lib/request-url";
import { createCheckout } from "@/server/services/billing";

export const dynamic = "force-dynamic";

const schema = z.object({ plan: z.enum(["monthly", "yearly"]) });

/** POST /api/subscription/checkout — Stripe Checkout (stub confirmation in preview). */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireRealUser();
    const { plan } = schema.parse(await req.json());
    const origin = originFromRequest(req);
    const { checkoutUrl } = await createCheckout(user.id, plan, origin);
    return json({ checkoutUrl });
  });
}
