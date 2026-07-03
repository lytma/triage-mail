import { handle, json } from "@/server/lib/http";
import { requireRealUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

/** DELETE /api/notifications/subscriptions/:subscriptionId */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  return handle(async () => {
    const user = await requireRealUser();
    const { subscriptionId } = await params;
    const sub = await prisma.notificationSubscription.findFirst({
      where: { id: subscriptionId, userAccountId: user.id },
    });
    if (!sub) throw new HttpError(404, "Not found");
    await prisma.notificationSubscription.delete({ where: { id: sub.id } });
    return json({ success: true });
  });
}
