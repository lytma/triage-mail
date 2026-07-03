import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { env } from "@/server/lib/env";
import { originFromRequest } from "@/server/lib/request-url";
import { findOrCreateOAuthUser } from "@/server/lib/auth";

export const dynamic = "force-dynamic";

/**
 * lytma broker callback: verify the broker JWT, then hand the verified identity
 * to NextAuth's "broker" credentials provider to mint an app session.
 */
export async function GET(req: Request) {
  const origin = originFromRequest(req);
  const url = new URL(req.url);
  const brokerError = url.searchParams.get("broker_error");
  if (brokerError) {
    return NextResponse.redirect(`${origin}/signin?error=google_failed`);
  }

  const token = url.searchParams.get("broker_token");
  if (!token) {
    return NextResponse.redirect(`${origin}/signin?error=google_failed`);
  }

  const jar = await cookies();
  const nonce = jar.get("g_nonce")?.value;
  const host = new URL(origin).host;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(env.OAUTH_BROKER_SECRET),
      { algorithms: ["HS256"] },
    );
    if (payload.aud !== host) throw new Error("aud mismatch");
    if (!nonce || payload.n !== nonce) throw new Error("nonce mismatch");

    const email = String(payload.email ?? "").toLowerCase();
    const sub = String(payload.sub ?? "");
    const name = String(payload.name ?? email);
    if (!email || !sub) throw new Error("missing identity");

    // Ensure the user exists so the credentials provider can find them.
    await findOrCreateOAuthUser({ email, name, provider: "google", subject: sub });

    // Redirect through NextAuth credentials callback via a self-posting form
    // is complex; instead redirect to a small client bridge that calls signIn.
    const bridge = new URL(`${origin}/signin/broker-complete`);
    bridge.searchParams.set("sub", sub);
    bridge.searchParams.set("email", email);
    bridge.searchParams.set("name", name);
    const res = NextResponse.redirect(bridge.toString());
    res.cookies.delete("g_nonce");
    return res;
  } catch {
    const res = NextResponse.redirect(`${origin}/signin?error=google_failed`);
    res.cookies.delete("g_nonce");
    return res;
  }
}
