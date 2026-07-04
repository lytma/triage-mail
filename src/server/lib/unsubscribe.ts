/**
 * Parse the RFC 2369 `List-Unsubscribe` (+ RFC 8058 `List-Unsubscribe-Post`)
 * headers into a single actionable target. These are email HEADERS (metadata),
 * not body content, so storing the chosen target is metadata-only.
 */

export interface ParsedUnsubscribe {
  /** The chosen unsubscribe target: an https(s) URL or a mailto: URI. */
  target: string | null;
  /** True when the sender supports RFC 8058 one-click (HTTPS POST) unsubscribe. */
  oneClick: boolean;
}

/** Extract the `<...>` bracketed URIs from a List-Unsubscribe header value. */
function extractUris(value: string): string[] {
  const out: string[] = [];
  const re = /<([^>]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const uri = m[1].trim();
    if (uri) out.push(uri);
  }
  return out;
}

export function parseListUnsubscribe(
  headers: Record<string, string> | undefined,
): ParsedUnsubscribe {
  if (!headers) return { target: null, oneClick: false };
  const raw = headers["list-unsubscribe"];
  if (!raw) return { target: null, oneClick: false };

  const uris = extractUris(raw);
  const httpUri = uris.find((u) => /^https?:\/\//i.test(u)) ?? null;
  const mailtoUri = uris.find((u) => /^mailto:/i.test(u)) ?? null;

  const post = headers["list-unsubscribe-post"] ?? "";
  const oneClick =
    Boolean(httpUri) && /list-unsubscribe=one-click/i.test(post);

  // Prefer a one-click HTTPS endpoint, then any HTTPS link, then mailto.
  const target = httpUri ?? mailtoUri ?? null;
  return { target, oneClick };
}
