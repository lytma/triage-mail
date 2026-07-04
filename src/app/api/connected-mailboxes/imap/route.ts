import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireRealUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { encryptToken } from "@/server/lib/crypto";
import { detectImapSettings } from "@/server/lib/imap-config";
import { verifyImapCredentials } from "@/server/providers/imap";
import { seedCategoryFolders } from "@/server/services/category-folders";
import { syncBackQueue } from "@/server/queues/queues";
import { track } from "@/server/lib/analytics";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/connected-mailboxes/imap — connect an IMAP mailbox (iCloud, Yahoo,
 * Fastmail, …) with an app-specific password. Server settings are auto-detected
 * from the email domain; the password is verified, encrypted, and stored. No
 * OAuth redirect — the connection completes inline.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireRealUser();
    const { email, password } = schema.parse(await req.json());
    const address = email.trim().toLowerCase();

    const verify = await verifyImapCredentials(address, password);
    if (!verify.ok) {
      throw new HttpError(
        400,
        "Couldn't sign in to that mailbox. Check the address and app-specific password.",
      );
    }

    const settings = detectImapSettings(address);
    const mailbox = await prisma.connectedMailbox.upsert({
      where: {
        uq_mailboxes_user_email: { userAccountId: user.id, emailAddress: address },
      },
      update: {
        provider: "imap",
        oauthRefreshTokenEncrypted: encryptToken(password),
        syncState: "active",
        lastSyncError: null,
      },
      create: {
        userAccountId: user.id,
        provider: "imap",
        emailAddress: address,
        oauthRefreshTokenEncrypted: encryptToken(password),
        syncState: "active",
      },
    });

    await seedCategoryFolders(user.id);
    await syncBackQueue().add("initial-sync", { connectedMailboxId: mailbox.id });
    await track("mailbox_connected", { provider: "imap" }, user.id);

    return json({
      mailbox: {
        id: mailbox.id,
        provider: mailbox.provider,
        emailAddress: mailbox.emailAddress,
        syncState: mailbox.syncState,
      },
      detected: settings.label,
    });
  });
}
