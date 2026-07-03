import type { Job } from "bullmq";
import type { TriageJobData } from "@/server/queues/queues";
import { webPushQueue } from "@/server/queues/queues";
import { triageEmail, triageFallbackToReview } from "@/server/services/triage";

/** Total configured attempts for the triage queue (see queues.ts defaultOpts). */
const MAX_ATTEMPTS = 5;

/**
 * Triage worker: classifies + routes a single email. On a review-routed
 * (important, not flagged) result it enqueues a web-push. If classification
 * keeps failing and this is the final attempt, it files a flagged fallback
 * review item so no email is lost — otherwise it rethrows to trigger retry.
 */
export async function processTriage(job: Job<TriageJobData>): Promise<unknown> {
  const data = job.data;

  try {
    const result = await triageEmail({
      userAccountId: data.userAccountId,
      connectedMailboxId: data.connectedMailboxId,
      providerMessageId: data.providerMessageId,
      mock: data.mock,
    });

    if (result.created && result.reviewQueueItemId && !result.flagged) {
      const who = result.senderName || result.senderEmail;
      await webPushQueue().add("important-email", {
        userAccountId: data.userAccountId,
        title: `New important email from ${who}`,
        body: result.subject ?? "(no subject)",
        url: "/review",
      });
    }

    return {
      emailMetadataId: result.emailMetadataId,
      reviewQueueItemId: result.reviewQueueItemId,
      finalCategory: result.finalCategory,
      flagged: result.flagged,
      created: result.created,
    };
  } catch (err) {
    const isFinalAttempt = job.attemptsMade + 1 >= MAX_ATTEMPTS;
    if (!isFinalAttempt) {
      // Retry with backoff.
      throw err;
    }
    console.error(
      `[worker:triage] classify failed on final attempt for ${data.providerMessageId}: ${
        (err as Error).message
      } — filing fallback review item.`,
    );
    const fallback = await triageFallbackToReview({
      userAccountId: data.userAccountId,
      connectedMailboxId: data.connectedMailboxId,
      providerMessageId: data.providerMessageId,
      mock: data.mock,
    });
    return { fallback: true, reviewQueueItemId: fallback?.reviewQueueItemId ?? null };
  }
}
