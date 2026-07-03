import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/lib/env";
import { triageQueue } from "@/server/queues/queues";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/gmail — Gmail Pub/Sub push. Verifies the verification
 * token, decodes the notification, and enqueues a triage sweep for the mailbox.
 * Stubbed in preview (no real Pub/Sub), but the verification + enqueue path is
 * real and idempotent.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (env.GMAIL_WEBHOOK_TOKEN && url.searchParams.get("token") !== env.GMAIL_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const dataB64 = body?.message?.data;
    if (dataB64) {
      const decoded = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8"));
      const emailAddress = decoded.emailAddress;
      if (emailAddress) {
        const mailbox = await prisma.connectedMailbox.findFirst({
          where: { provider: "gmail", emailAddress },
        });
        if (mailbox) {
          await triageQueue().add("gmail-webhook", {
            userAccountId: mailbox.userAccountId,
            connectedMailboxId: mailbox.id,
            providerMessageId: `pending-${decoded.historyId ?? Date.now()}`,
          });
        }
      }
    }
  } catch (err) {
    console.error("[webhook:gmail]", err);
  }
  return NextResponse.json({ acknowledged: true });
}
