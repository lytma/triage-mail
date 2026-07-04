import { handle, json } from "@/server/lib/http";
import { requireUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { track } from "@/server/lib/analytics";
import { mailboxActionQueue } from "@/server/queues/queues";

export const dynamic = "force-dynamic";

/**
 * POST /api/emails/:emailMetadataId/unsubscribe — one-click unsubscribe from a
 * marketing/newsletter sender using the parsed List-Unsubscribe target. Marks
 * the email archived locally and enqueues the unsubscribe (HTTP one-click or
 * mailto) to run in the worker. Simulated (no network) for demo users.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ emailMetadataId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { emailMetadataId } = await params;

    const email = await prisma.emailMetadata.findFirst({
      where: { id: emailMetadataId, userAccountId: user.id },
      include: { categoryFolder: { select: { slug: true } } },
    });
    if (!email) throw new HttpError(404, "Email not found");
    if (!email.unsubscribeTarget) {
      throw new HttpError(422, "This email has no unsubscribe link.");
    }

    // Leaving the folder mirrors the user's intent (done with this sender).
    await prisma.emailMetadata.update({
      where: { id: email.id },
      data: { isArchived: true },
    });

    if (!user.isDemo) {
      await mailboxActionQueue().add("unsubscribe", {
        userAccountId: user.id,
        connectedMailboxId: email.connectedMailboxId,
        action: "unsubscribe",
        emailMetadataId: email.id,
        providerMessageId: email.providerMessageId,
      });
    }

    await track(
      "email_unsubscribe_requested",
      { category: email.categoryFolder?.slug ?? null, one_click: email.unsubscribeOneClick },
      user.id,
    );

    return json({ ok: true, syncedToProvider: !user.isDemo });
  });
}
