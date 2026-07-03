import { handle, json } from "@/server/lib/http";
import { requireRealUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { originFromRequest } from "@/server/lib/request-url";
import { buildMailboxConsentUrl } from "@/server/lib/mailbox-oauth";

export const dynamic = "force-dynamic";

/**
 * POST /api/connected-mailboxes/:mailboxId/reconnect — re-auth a lost mailbox.
 * Returns { redirectUrl } to the provider OAuth consent for re-authorization.
 */
export async function POST(req: Request, { params }: { params: Promise<{ mailboxId: string }> }) {
  return handle(async () => {
    const user = await requireRealUser();
    const { mailboxId } = await params;
    const mailbox = await prisma.connectedMailbox.findFirst({
      where: { id: mailboxId, userAccountId: user.id },
    });
    if (!mailbox) throw new HttpError(404, "Not found");

    const origin = originFromRequest(req);
    const state = Buffer.from(
      JSON.stringify({ userId: user.id, provider: mailbox.provider, mailboxId: mailbox.id, reconnect: true }),
    ).toString("base64url");
    const redirectUrl = buildMailboxConsentUrl(
      mailbox.provider as "gmail" | "outlook",
      origin,
      state,
    );
    return json({ redirectUrl });
  });
}
