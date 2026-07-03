import type { Job } from "bullmq";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/lib/env";
import { decryptToken, encryptToken } from "@/server/lib/crypto";
import { isPlaceholderToken } from "@/server/providers/types";
import type { TokenRefreshJobData } from "@/server/queues/queues";

/**
 * Token-refresh worker: exchanges the stored refresh token for a fresh access
 * token and persists it (re-encrypted). No-op in stub mode (no client creds or
 * placeholder refresh token). On refresh failure the mailbox is disconnected.
 */
export async function processTokenRefresh(
  job: Job<TokenRefreshJobData>,
): Promise<unknown> {
  const { connectedMailboxId } = job.data;
  const mailbox = await prisma.connectedMailbox.findUnique({
    where: { id: connectedMailboxId },
  });
  if (!mailbox) {
    throw new Error(`ConnectedMailbox ${connectedMailboxId} not found`);
  }

  const refreshToken = decryptToken(mailbox.oauthRefreshTokenEncrypted ?? "");
  const hasClientCreds =
    mailbox.provider === "gmail"
      ? Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET)
      : Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);

  if (!hasClientCreds || isPlaceholderToken(refreshToken)) {
    console.log(
      `[token-refresh:stub] mailbox ${mailbox.id} (${mailbox.provider}) — no-op.`,
    );
    return { skipped: true, mode: "stub" };
  }

  try {
    let accessToken: string;
    let expiresInSec = 3600;

    if (mailbox.provider === "gmail") {
      const { google } = await import("googleapis");
      const oauth2 = new google.auth.OAuth2(
        env.GMAIL_CLIENT_ID,
        env.GMAIL_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI,
      );
      oauth2.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await oauth2.refreshAccessToken();
      accessToken = credentials.access_token ?? "";
      if (credentials.expiry_date) {
        expiresInSec = Math.max(
          60,
          Math.floor((credentials.expiry_date - Date.now()) / 1000),
        );
      }
    } else {
      const tenant = env.MICROSOFT_TENANT_ID || "common";
      const body = new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://graph.microsoft.com/.default offline_access",
      });
      const res = await fetch(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        { method: "POST", body },
      );
      const json = (await res.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (!json.access_token) throw new Error("Graph refresh returned no token");
      accessToken = json.access_token;
      expiresInSec = json.expires_in ?? 3600;
    }

    if (!accessToken) throw new Error("Empty access token from refresh");

    await prisma.connectedMailbox.update({
      where: { id: mailbox.id },
      data: {
        oauthAccessTokenEncrypted: encryptToken(accessToken),
        tokenExpiresAt: new Date(Date.now() + expiresInSec * 1000),
        syncState: mailbox.syncState === "disconnected" ? "active" : mailbox.syncState,
        lastSyncError: null,
      },
    });

    return { refreshed: true };
  } catch (err) {
    await prisma.connectedMailbox.update({
      where: { id: mailbox.id },
      data: {
        syncState: "disconnected",
        lastSyncError: `Token refresh failed: ${(err as Error).message}`,
      },
    });
    console.error(
      `[worker:token-refresh] refresh failed for ${mailbox.id}; marked disconnected.`,
    );
    return { disconnected: true };
  }
}
