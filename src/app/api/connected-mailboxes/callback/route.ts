import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { encryptToken } from "@/server/lib/crypto";
import { env, features } from "@/server/lib/env";
import { originFromRequest } from "@/server/lib/request-url";
import { seedCategoryFolders } from "@/server/services/category-folders";
import { syncBackQueue } from "@/server/queues/queues";

export const dynamic = "force-dynamic";

/**
 * Mailbox OAuth callback. In real mode, exchanges the auth code for tokens and
 * creates/updates the ConnectedMailbox, then kicks off an initial sync. In
 * preview (placeholder creds) the exchange can't complete, so we redirect to
 * Settings with an informative flag.
 */
export async function GET(req: Request) {
  const origin = originFromRequest(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");

  if (url.searchParams.get("error") || !code || !stateRaw) {
    return NextResponse.redirect(`${origin}/settings?connect=incomplete`);
  }

  let state: { userId: string; provider: "gmail" | "outlook"; mailboxId?: string };
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
  } catch {
    return NextResponse.redirect(`${origin}/settings?connect=error`);
  }

  const canExchange =
    (state.provider === "gmail" && features.googleDirect) ||
    (state.provider === "outlook" && features.microsoft);

  if (!canExchange) {
    // Preview: cannot complete without real provider credentials.
    return NextResponse.redirect(`${origin}/settings?connect=preview_unavailable`);
  }

  try {
    const redirectUri = `${origin}/api/connected-mailboxes/callback`;
    const { refreshToken, accessToken, expiresAt, email } = await exchangeCode(
      state.provider,
      code,
      redirectUri,
    );

    const mailbox = await prisma.connectedMailbox.upsert({
      where: {
        uq_mailboxes_user_email: { userAccountId: state.userId, emailAddress: email },
      },
      update: {
        oauthRefreshTokenEncrypted: encryptToken(refreshToken),
        oauthAccessTokenEncrypted: accessToken ? encryptToken(accessToken) : null,
        tokenExpiresAt: expiresAt,
        syncState: "active",
        lastSyncError: null,
      },
      create: {
        userAccountId: state.userId,
        provider: state.provider,
        emailAddress: email,
        oauthRefreshTokenEncrypted: encryptToken(refreshToken),
        oauthAccessTokenEncrypted: accessToken ? encryptToken(accessToken) : null,
        tokenExpiresAt: expiresAt,
        syncState: "active",
      },
    });

    await seedCategoryFolders(state.userId);
    await syncBackQueue().add("initial-sync", { connectedMailboxId: mailbox.id });

    return NextResponse.redirect(`${origin}/settings?connect=success`);
  } catch (err) {
    console.error("[mailbox-callback]", err);
    return NextResponse.redirect(`${origin}/settings?connect=error`);
  }
}

async function exchangeCode(
  provider: "gmail" | "outlook",
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string; accessToken?: string; expiresAt?: Date; email: string }> {
  if (provider === "gmail") {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GMAIL_CLIENT_ID,
        client_secret: env.GMAIL_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const data = await res.json();
    const email = await fetchGmailEmail(data.access_token);
    return {
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      email,
    };
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    },
  );
  const data = await res.json();
  const email = await fetchOutlookEmail(data.access_token);
  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    email,
  };
}

async function fetchGmailEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return data.email;
}

async function fetchOutlookEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return data.mail ?? data.userPrincipalName;
}
