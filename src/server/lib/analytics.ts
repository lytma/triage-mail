import { prisma } from "@/server/db/prisma";
import { env } from "./env";

/**
 * First-party, privacy-respecting event tracking.
 * Writes to the local `events` table. Never include PII in props
 * (no email addresses, subjects, sender names, or rule text — only
 * categorical/numeric fields). Optionally forwards to a hosted provider.
 */
export async function track(
  name: string,
  props?: Record<string, unknown>,
  userId?: string | null,
): Promise<void> {
  try {
    await prisma.event.create({
      data: {
        name,
        userId: userId ?? null,
        props: (props ?? {}) as object,
      },
    });

    if (env.ANALYTICS_PROVIDER_URL) {
      // Best-effort server-side forwarding; never blocks or throws.
      void fetch(env.ANALYTICS_PROVIDER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, props: props ?? {}, userId: userId ?? null }),
      }).catch(() => {});
    }
  } catch (err) {
    // Analytics must never break a request.
    console.error("[analytics] track failed:", (err as Error).message);
  }
}
