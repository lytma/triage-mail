import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireRealUser } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { originFromRequest } from "@/server/lib/request-url";
import { buildMailboxConsentUrl } from "@/server/lib/mailbox-oauth";

export const dynamic = "force-dynamic";

/** GET /api/connected-mailboxes — list mailboxes + sync status. */
export async function GET() {
  return handle(async () => {
    const user = await requireRealUser();
    const mailboxes = await prisma.connectedMailbox.findMany({
      where: { userAccountId: user.id },
      orderBy: { createdAt: "asc" },
    });
    return json({
      mailboxes: mailboxes.map((m) => ({
        id: m.id,
        provider: m.provider,
        emailAddress: m.emailAddress,
        syncState: m.syncState,
        lastSyncedAt: m.lastSyncedAt,
        lastSyncError: m.lastSyncError,
      })),
    });
  });
}

const schema = z.object({ provider: z.enum(["gmail", "outlook"]) });

/**
 * POST /api/connected-mailboxes — begin OAuth to connect a mailbox.
 * Returns { redirectUrl } (client redirects the browser to provider consent).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireRealUser();
    const { provider } = schema.parse(await req.json());
    const origin = originFromRequest(req);
    const state = Buffer.from(JSON.stringify({ userId: user.id, provider, t: Date.now() })).toString("base64url");
    const redirectUrl = buildMailboxConsentUrl(provider, origin, state);
    return json({ redirectUrl });
  });
}
