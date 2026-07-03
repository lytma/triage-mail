import { headers } from "next/headers";

/**
 * Derive this app's own public origin from the incoming request's forwarded
 * headers. NEVER hardcode localhost or a baked env var — preview hosts are
 * dynamic and sit behind a TLS-terminating proxy.
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/** Same as getRequestOrigin but from a Request/NextRequest's headers. */
export function originFromRequest(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function buildCanonicalUrl(path: string): Promise<string> {
  const origin = await getRequestOrigin();
  return `${origin}${path}`;
}
