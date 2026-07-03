import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { ComposeForm, type ComposeMailbox, type ComposePrefill } from "@/components/compose/compose-form";

export const dynamic = "force-dynamic";

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; itemId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  const sp = await searchParams;
  const mode = sp.mode === "reply" || sp.mode === "forward" ? sp.mode : undefined;
  const itemId = sp.itemId;

  // Load connected mailboxes for the From selector.
  const mailboxRows = await prisma.connectedMailbox.findMany({
    where: { userAccountId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      provider: true,
      emailAddress: true,
      syncState: true,
    },
  });

  const mailboxes: ComposeMailbox[] = mailboxRows.map((m) => ({
    id: m.id,
    provider: m.provider,
    emailAddress: m.emailAddress,
    syncState: m.syncState,
  }));

  // For reply/forward, load the source email metadata to prefill context.
  let prefill: ComposePrefill | undefined;
  if (mode && itemId) {
    const item = await prisma.reviewQueueItem.findFirst({
      where: { id: itemId, userAccountId: user.id },
      include: {
        emailMetadata: { include: { connectedMailbox: true } },
      },
    });
    if (item?.emailMetadata) {
      const em = item.emailMetadata;
      prefill = {
        mode,
        itemId,
        sourceMailboxId: em.connectedMailboxId,
        senderEmail: em.senderEmail,
        senderName: em.senderName ?? null,
        subject: em.subject ?? "",
        receivedAt: em.receivedAt.toISOString(),
      };
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <ComposeForm mailboxes={mailboxes} isDemo={user.isDemo} prefill={prefill} />
    </div>
  );
}
