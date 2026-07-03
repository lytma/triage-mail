import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { triageQueue } from "@/server/queues/queues";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/outlook — Microsoft Graph change notification.
 * Graph requires echoing back `validationToken` on subscription setup; then
 * notifications carry resource + clientState. Enqueues a triage sweep.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    // Subscription validation handshake.
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const notifications: unknown[] = body?.value ?? [];
    for (const n of notifications) {
      const note = n as { resourceData?: { id?: string }; clientState?: string };
      // clientState carries the mailbox id we set at subscription time.
      const mailboxId = note.clientState;
      if (!mailboxId) continue;
      const mailbox = await prisma.connectedMailbox.findFirst({
        where: { id: mailboxId, provider: "outlook" },
      });
      if (mailbox && note.resourceData?.id) {
        await triageQueue().add("outlook-webhook", {
          userAccountId: mailbox.userAccountId,
          connectedMailboxId: mailbox.id,
          providerMessageId: note.resourceData.id,
        });
      }
    }
  } catch (err) {
    console.error("[webhook:outlook]", err);
  }
  return NextResponse.json({ acknowledged: true });
}
