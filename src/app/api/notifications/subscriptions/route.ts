import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireRealUser } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { track } from "@/server/lib/analytics";

export const dynamic = "force-dynamic";

/** GET /api/notifications/subscriptions — list active push subscriptions. */
export async function GET() {
  return handle(async () => {
    const user = await requireRealUser();
    const subs = await prisma.notificationSubscription.findMany({
      where: { userAccountId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return json({
      subscriptions: subs.map((s) => ({
        id: s.id,
        endpoint: s.endpoint,
        isActive: s.isActive,
        createdAt: s.createdAt,
      })),
    });
  });
}

const schema = z.object({
  endpoint: z.string().url(),
  p256dhKey: z.string().min(1),
  authSecret: z.string().min(1),
});

/** POST /api/notifications/subscriptions — register a web push subscription. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireRealUser();
    const input = schema.parse(await req.json());
    const sub = await prisma.notificationSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: {
        userAccountId: user.id,
        p256dhKey: input.p256dhKey,
        authSecret: input.authSecret,
        isActive: true,
      },
      create: {
        userAccountId: user.id,
        endpoint: input.endpoint,
        p256dhKey: input.p256dhKey,
        authSecret: input.authSecret,
        isActive: true,
      },
    });
    await track("push_subscribed", {}, user.id);
    return json({ id: sub.id, isActive: sub.isActive }, 201);
  });
}
