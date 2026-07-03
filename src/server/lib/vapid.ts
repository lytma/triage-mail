import webpush from "web-push";
import { env } from "./env";

/**
 * VAPID key access. If keys aren't configured, derive a stable dev keypair once
 * so the push code paths run (delivery is best-effort in preview).
 */
let cached: { publicKey: string; privateKey: string } | null = null;

export function getVapidKeys(): { publicKey: string; privateKey: string } {
  if (cached) return cached;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  } else {
    cached = webpush.generateVAPIDKeys();
    console.warn("[vapid] no keys configured — generated an ephemeral dev keypair (push is best-effort)");
  }
  return cached;
}
