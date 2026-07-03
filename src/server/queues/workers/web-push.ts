import type { Job } from "bullmq";
import webpush from "web-push";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/lib/env";
import type { WebPushJobData } from "@/server/queues/queues";

/**
 * Web-push worker: sends VAPID push notifications to a user's active
 * subscriptions. If VAPID keys are absent we run in dev/no-op mode (log and
 * skip delivery). A single failed endpoint never throws; a 404/410 prunes the
 * subscription. Only systemic errors propagate for retry.
 */

let configured: "live" | "dev-noop" | null = null;

function ensureVapid(): boolean {
  if (configured) return configured === "live";
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );
    configured = "live";
    return true;
  }
  // No keys: run in no-op mode. (We intentionally do NOT deliver with a random
  // dev keypair — subscriptions were created against a different app key, so
  // delivery would fail anyway. Log and skip.)
  configured = "dev-noop";
  console.warn(
    "[worker:web-push] VAPID keys absent — running in dev/no-op mode (notifications logged, not delivered).",
  );
  return false;
}

export async function processWebPush(job: Job<WebPushJobData>): Promise<unknown> {
  const data = job.data;
  const live = ensureVapid();

  const subs = await prisma.notificationSubscription.findMany({
    where: { userAccountId: data.userAccountId, isActive: true },
  });

  const payload = JSON.stringify({
    title: data.title,
    body: data.body,
    url: data.url ?? "/review",
  });

  if (!live) {
    console.log(
      `[web-push:noop] -> user ${data.userAccountId}, ${subs.length} sub(s): "${data.title}"`,
    );
    return { delivered: 0, mode: "dev-noop", subscriptions: subs.length };
  }

  let delivered = 0;
  let pruned = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dhKey, auth: sub.authSecret },
        },
        payload,
      );
      delivered += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.notificationSubscription.update({
          where: { id: sub.id },
          data: { isActive: false },
        });
        pruned += 1;
        console.warn(
          `[worker:web-push] pruned expired subscription ${sub.id} (status ${statusCode}).`,
        );
      } else {
        // Log and continue — never fail the whole job for one endpoint.
        console.error(
          `[worker:web-push] delivery error to ${sub.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  return { delivered, pruned, mode: "live" };
}
