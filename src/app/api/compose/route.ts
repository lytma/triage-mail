import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { track } from "@/server/lib/analytics";
import { mailboxActionQueue } from "@/server/queues/queues";

export const dynamic = "force-dynamic";

const schema = z.object({
  connectedMailboxId: z.string().uuid(),
  to: z.array(z.string()).min(1),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().min(1),
  body: z.string().default(""),
});

/** POST /api/compose — send a new email from a chosen connected mailbox. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = schema.parse(await req.json());

    const mailbox = await prisma.connectedMailbox.findFirst({
      where: { id: input.connectedMailboxId, userAccountId: user.id },
    });
    if (!mailbox) throw new HttpError(404, "Mailbox not found");

    if (user.isDemo) {
      await track("email_composed", { send_type: "new", demo: true }, user.id);
      return json({ sentMessageId: "demo", syncedToProvider: false, demo: true });
    }

    await mailboxActionQueue().add("send", {
      userAccountId: user.id,
      connectedMailboxId: mailbox.id,
      action: "send",
      payload: {
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        body: input.body,
      },
    });
    await track("email_composed", { send_type: "new" }, user.id);
    return json({ sentMessageId: `queued`, syncedToProvider: true });
  });
}
