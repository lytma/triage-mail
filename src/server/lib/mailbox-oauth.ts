import { env } from "./env";

/**
 * Build provider OAuth consent URLs for MAILBOX connection (separate from the
 * login OAuth). Uses mail scopes: read, send, and modify labels/folders.
 * In preview the client IDs are placeholders, so the URL is correct but the
 * flow cannot complete without real credentials — which satisfies the
 * "redirect URL is correct" acceptance criterion.
 */

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

const OUTLOOK_SCOPES = [
  "offline_access",
  "openid",
  "email",
  "Mail.ReadWrite",
  "Mail.Send",
];

export function buildMailboxConsentUrl(
  provider: "gmail" | "outlook",
  origin: string,
  state: string,
): string {
  const redirectUri = `${origin}/api/connected-mailboxes/callback`;
  if (provider === "gmail") {
    const clientId = env.GMAIL_CLIENT_ID || "PLACEHOLDER_GOOGLE_CLIENT_ID";
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES.join(" "),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
  }
  const clientId = env.MICROSOFT_CLIENT_ID || "PLACEHOLDER_MS_CLIENT_ID";
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    state,
  });
  return `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${p.toString()}`;
}
