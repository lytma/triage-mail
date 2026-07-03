import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/lib/env";
import { triageQueue } from "@/server/queues/queues";

export const dynamic = "force-dynamic";

const schema = z.object({
  senderEmail: z.string(),
  senderName: z.string().optional(),
  subject: z.string().optional(),
  snippet: z.string().optional(),
  connectedMailboxId: z.string().uuid().optional(),
});

/**
 * POST /api/dev/triage — enqueue a mock triage job for smoke-testing the
 * pipeline in preview (provider webhooks are stubbed). Gated to SEED_ON_BOOT +
 * a real signed-in user; not available in production.
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!env.SEED_ON_BOOT) throw new HttpError(404, "Not found");
    const user = await requireUser();
    if (user.isDemo) throw new HttpError(403, "Not in demo");
    const input = schema.parse(await req.json());

    const mailbox = input.connectedMailboxId
      ? await prisma.connectedMailbox.findFirst({
          where: { id: input.connectedMailboxId, userAccountId: user.id },
        })
      : await prisma.connectedMailbox.findFirst({ where: { userAccountId: user.id } });
    if (!mailbox) throw new HttpError(400, "No connected mailbox");

    const providerMessageId = `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await triageQueue().add("dev-mock", {
      userAccountId: user.id,
      connectedMailboxId: mailbox.id,
      providerMessageId,
      mock: {
        senderEmail: input.senderEmail,
        senderName: input.senderName,
        subject: input.subject,
        snippet: input.snippet,
        receivedAt: new Date().toISOString(),
      },
    });
    return json({ enqueued: true, providerMessageId });
  });
}
