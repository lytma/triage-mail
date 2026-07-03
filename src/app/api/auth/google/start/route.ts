import { NextResponse } from "next/server";
import crypto from "crypto";
import { env, features } from "@/server/lib/env";
import { originFromRequest } from "@/server/lib/request-url";

export const dynamic = "force-dynamic";

/**
 * Begin Google sign-in.
 * - Direct mode (user's own client configured): NextAuth handles it, so this
 *   route just forwards to the NextAuth Google provider.
 * - Broker mode (preview): redirect the browser to the lytma OAuth broker with
 *   this app's own absolute callback URL + a nonce stored in an httpOnly cookie.
 */
export async function GET(req: Request) {
  const origin = originFromRequest(req);

  if (features.googleDirect) {
    return NextResponse.redirect(`${origin}/api/auth/signin/google`);
  }

  if (features.googleBroker) {
    const nonce = crypto.randomBytes(16).toString("hex");
    const appCallback = `${origin}/api/auth/google/callback`;
    const url = `${env.OAUTH_BROKER_URL}/google/start?app_redirect=${encodeURIComponent(
      appCallback,
    )}&nonce=${encodeURIComponent(nonce)}`;
    const res = NextResponse.redirect(url);
    res.cookies.set("g_nonce", nonce, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  }

  return NextResponse.redirect(`${origin}/signin?error=google_unavailable`);
}
