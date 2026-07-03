import { handle, json } from "@/server/lib/http";
import { requireRealUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

/** DELETE /api/connected-mailboxes/:mailboxId — disconnect and stop sync. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ mailboxId: string }> }) {
  return handle(async () => {
    const user = await requireRealUser();
    const { mailboxId } = await params;
    const mailbox = await prisma.connectedMailbox.findFirst({
      where: { id: mailboxId, userAccountId: user.id },
    });
    if (!mailbox) throw new HttpError(404, "Not found");
    await prisma.connectedMailbox.delete({ where: { id: mailbox.id } });
    return json({ success: true });
  });
}
