import { prisma } from "@/server/db/prisma";
import { getProvider } from "@/server/providers";
import type { ProviderMessage } from "@/server/providers";
import { getFolderIdForClassification } from "@/server/services/category-folders";
import { classifyEmail, type Classification, type ClassifyResult } from "./llm";
import { evaluateRules } from "./rules-engine";
import { recordTriageStats } from "./stats";

/**
 * The triage engine — classifies a single incoming email and routes it to the
 * Review queue or a category folder, persisting METADATA ONLY (no body/snippet).
 *
 * Idempotent per (connectedMailboxId, providerMessageId): rules/AI never re-run
 * on already-processed mail.
 */

const LOW_CONFIDENCE_THRESHOLD = 0.7;

export interface TriageParams {
  userAccountId: string;
  connectedMailboxId: string;
  providerMessageId: string;
  /** Inline mock message + test hooks (stub/testing without a provider call). */
  mock?: {
    senderEmail: string;
    senderName?: string;
    subject?: string;
    snippet?: string;
    receivedAt?: string | Date;
    threadId?: string;
    hasAttachments?: boolean;
    /** Test-only: force the AI classification result (production path intact). */
    forceClassification?: Partial<ClassifyResult> & { classification?: Classification };
  };
}

export interface TriageResult {
  emailMetadataId: string;
  reviewQueueItemId: string | null;
  classification: Classification;
  finalCategory: Classification;
  flagged: boolean;
  /** True when a fresh triage ran (false when returned via idempotency guard). */
  created: boolean;
  senderEmail: string;
  senderName: string | null;
  subject: string | null;
}

async function resolveMessage(params: TriageParams): Promise<{
  message: ProviderMessage;
  provider: "gmail" | "outlook";
}> {
  const mailbox = await prisma.connectedMailbox.findUnique({
    where: { id: params.connectedMailboxId },
  });
  if (!mailbox) {
    throw new Error(`ConnectedMailbox ${params.connectedMailboxId} not found`);
  }

  if (params.mock) {
    const m = params.mock;
    return {
      provider: mailbox.provider,
      message: {
        providerMessageId: params.providerMessageId,
        threadId: m.threadId,
        senderEmail: m.senderEmail,
        senderName: m.senderName,
        subject: m.subject,
        snippet: m.snippet,
        receivedAt: m.receivedAt ? new Date(m.receivedAt) : new Date(),
        hasAttachments: Boolean(m.hasAttachments),
      },
    };
  }

  const provider = getProvider(mailbox.provider);
  const message = await provider.fetchMessage(mailbox, params.providerMessageId);
  return { provider: mailbox.provider, message };
}

/**
 * Triage a single email. Throws if classification fails (so the queue retries).
 * Body/snippet are used transiently and never persisted.
 */
export async function triageEmail(params: TriageParams): Promise<TriageResult> {
  // 2. Idempotency guard — return existing record without re-triaging.
  const existing = await prisma.emailMetadata.findUnique({
    where: {
      uq_email_provider_msg: {
        connectedMailboxId: params.connectedMailboxId,
        providerMessageId: params.providerMessageId,
      },
    },
    include: { triageDecision: true, reviewQueueItem: true },
  });
  if (existing) {
    return {
      emailMetadataId: existing.id,
      reviewQueueItemId: existing.reviewQueueItem?.id ?? null,
      classification:
        (existing.triageDecision?.classification as Classification) ?? "fyi",
      finalCategory:
        (existing.triageDecision?.finalCategory as Classification) ?? "fyi",
      flagged: existing.isFlaggedLowConfidence,
      created: false,
      senderEmail: existing.senderEmail,
      senderName: existing.senderName,
      subject: existing.subject,
    };
  }

  // 1. Fetch message (mock or provider).
  const { message } = await resolveMessage(params);

  // 3. Load active rules, priority DESC then createdAt DESC.
  const rules = await prisma.triageRule.findMany({
    where: { userAccountId: params.userAccountId, isActive: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  const match = evaluateRules(
    {
      senderEmail: message.senderEmail,
      senderName: message.senderName,
      subject: message.subject,
    },
    rules,
  );

  // 4. ALWAYS classify (AI still supplies reason/confidence even if a rule matched).
  let ai: ClassifyResult;
  if (params.mock?.forceClassification) {
    const f = params.mock.forceClassification;
    ai = {
      classification: f.classification ?? "fyi",
      importanceScore: f.importanceScore ?? 0.5,
      confidenceScore: f.confidenceScore ?? 0.85,
      reason: f.reason ?? "Forced classification (test).",
      model: f.model ?? "stub-forced",
      promptTokens: f.promptTokens,
      completionTokens: f.completionTokens,
    };
  } else {
    ai = await classifyEmail({
      senderEmail: message.senderEmail,
      senderName: message.senderName,
      subject: message.subject,
      snippet: message.snippet,
      headers: message.headers,
    });
  }

  // 5. Final category: rule wins routing.
  const aiClassification = ai.classification;
  const overriddenByRuleId = match?.rule.id ?? null;
  const finalCategory: Classification = match
    ? (match.rule.targetClassification as Classification)
    : aiClassification;

  // 6. Low-confidence flag: only when NO rule matched.
  const isFlaggedLowConfidence =
    !match && ai.confidenceScore < LOW_CONFIDENCE_THRESHOLD;

  // 7. Routing.
  //    Review queue ONLY when finalCategory === 'important' && !flagged.
  //    A flagged 'important' AI guess is filed into 'fyi' as the safe best guess.
  const routeToQueue = finalCategory === "important" && !isFlaggedLowConfidence;

  let categoryFolderId: string | null = null;
  let isImportant = false;

  if (routeToQueue) {
    isImportant = true;
    categoryFolderId = null;
  } else if (finalCategory === "important" && isFlaggedLowConfidence) {
    // Best-guess non-important folder for a flagged important guess.
    categoryFolderId = await getFolderIdForClassification(params.userAccountId, "fyi");
    isImportant = false;
  } else {
    categoryFolderId = await getFolderIdForClassification(
      params.userAccountId,
      finalCategory,
    );
    isImportant = false;
  }

  // 8. Persist metadata + decision (+ review item) in a transaction.
  const receivedAt = message.receivedAt;
  const senderName = message.senderName ?? null;
  const subject = message.subject ?? null;

  const result = await prisma.$transaction(async (tx) => {
    const emailMetadata = await tx.emailMetadata.create({
      data: {
        userAccountId: params.userAccountId,
        connectedMailboxId: params.connectedMailboxId,
        providerMessageId: params.providerMessageId,
        providerThreadId: message.threadId ?? null,
        senderEmail: message.senderEmail,
        senderName,
        subject,
        receivedAt,
        categoryFolderId,
        isImportant,
        isFlaggedLowConfidence,
        hasAttachments: message.hasAttachments,
        // NOTE: snippet/body intentionally NOT stored.
      },
    });

    await tx.triageDecision.create({
      data: {
        emailMetadataId: emailMetadata.id,
        userAccountId: params.userAccountId,
        classification: aiClassification,
        confidenceScore: ai.confidenceScore,
        reason: ai.reason,
        finalCategory,
        overriddenByRuleId,
        llmModel: ai.model,
        llmPromptTokens: ai.promptTokens ?? null,
        llmCompletionTokens: ai.completionTokens ?? null,
      },
    });

    let reviewQueueItemId: string | null = null;
    if (routeToQueue) {
      const rq = await tx.reviewQueueItem.create({
        data: {
          userAccountId: params.userAccountId,
          emailMetadataId: emailMetadata.id,
          importanceScore: ai.importanceScore,
          status: "pending",
        },
      });
      reviewQueueItemId = rq.id;
    }

    return { emailMetadataId: emailMetadata.id, reviewQueueItemId };
  });

  // 9. Stats.
  await recordTriageStats(params.userAccountId, {
    finalCategory,
    flagged: isFlaggedLowConfidence,
    ruleOverridden: Boolean(match),
  });

  // 10. Summary for the worker (which enqueues push if a review item was made).
  return {
    emailMetadataId: result.emailMetadataId,
    reviewQueueItemId: result.reviewQueueItemId,
    classification: aiClassification,
    finalCategory,
    flagged: isFlaggedLowConfidence,
    created: true,
    senderEmail: message.senderEmail,
    senderName,
    subject,
  };
}

/**
 * Fallback used by the triage worker when classification has exhausted its
 * retries: file the email flagged into the Review queue so nothing is lost.
 * Best-effort and idempotent.
 */
export async function triageFallbackToReview(
  params: TriageParams,
  reason = "Triage unavailable — review manually.",
): Promise<TriageResult | null> {
  const existing = await prisma.emailMetadata.findUnique({
    where: {
      uq_email_provider_msg: {
        connectedMailboxId: params.connectedMailboxId,
        providerMessageId: params.providerMessageId,
      },
    },
    include: { reviewQueueItem: true, triageDecision: true },
  });
  if (existing) {
    return {
      emailMetadataId: existing.id,
      reviewQueueItemId: existing.reviewQueueItem?.id ?? null,
      classification:
        (existing.triageDecision?.classification as Classification) ?? "important",
      finalCategory:
        (existing.triageDecision?.finalCategory as Classification) ?? "important",
      flagged: existing.isFlaggedLowConfidence,
      created: false,
      senderEmail: existing.senderEmail,
      senderName: existing.senderName,
      subject: existing.subject,
    };
  }

  let message: ProviderMessage;
  try {
    ({ message } = await resolveMessage(params));
  } catch {
    // If even fetching fails, synthesize minimal metadata so nothing is lost.
    message = {
      providerMessageId: params.providerMessageId,
      senderEmail: params.mock?.senderEmail ?? "unknown@unknown",
      senderName: params.mock?.senderName,
      subject: params.mock?.subject,
      receivedAt: new Date(),
      hasAttachments: false,
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const emailMetadata = await tx.emailMetadata.create({
      data: {
        userAccountId: params.userAccountId,
        connectedMailboxId: params.connectedMailboxId,
        providerMessageId: params.providerMessageId,
        providerThreadId: message.threadId ?? null,
        senderEmail: message.senderEmail,
        senderName: message.senderName ?? null,
        subject: message.subject ?? null,
        receivedAt: message.receivedAt,
        categoryFolderId: null,
        isImportant: true,
        isFlaggedLowConfidence: true,
        hasAttachments: message.hasAttachments,
      },
    });
    await tx.triageDecision.create({
      data: {
        emailMetadataId: emailMetadata.id,
        userAccountId: params.userAccountId,
        classification: "important",
        confidenceScore: 0,
        reason,
        finalCategory: "important",
        overriddenByRuleId: null,
        llmModel: "unavailable",
      },
    });
    const rq = await tx.reviewQueueItem.create({
      data: {
        userAccountId: params.userAccountId,
        emailMetadataId: emailMetadata.id,
        importanceScore: 0.5,
        status: "pending",
      },
    });
    return { emailMetadataId: emailMetadata.id, reviewQueueItemId: rq.id };
  });

  await recordTriageStats(params.userAccountId, {
    finalCategory: "important",
    flagged: true,
    ruleOverridden: false,
  });

  return {
    emailMetadataId: created.emailMetadataId,
    reviewQueueItemId: created.reviewQueueItemId,
    classification: "important",
    finalCategory: "important",
    flagged: true,
    created: true,
    senderEmail: message.senderEmail,
    senderName: message.senderName ?? null,
    subject: message.subject ?? null,
  };
}
