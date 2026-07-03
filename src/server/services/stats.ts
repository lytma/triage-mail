import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { Classification } from "./llm";

/**
 * Daily triage summary stat aggregation. Rows are keyed by (user, stat_date)
 * where stat_date is midnight (a DATE column). Increments are additive so
 * concurrent workers can accumulate safely via prisma upsert.
 */

/** Today at UTC midnight — matches the @db.Date column semantics. */
function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const CATEGORY_COLUMN: Record<Classification, keyof Prisma.TriageSummaryStatUpdateInput> = {
  important: "importantCount",
  fyi: "fyiCount",
  newsletter: "newsletterCount",
  marketing: "marketingCount",
  receipt: "receiptCount",
  automated_notification: "automatedNotificationCount",
};

export interface RecordTriageStatsInput {
  finalCategory: Classification;
  flagged: boolean;
  ruleOverridden: boolean;
}

/** Increment the daily counters for a single triaged email. */
export async function recordTriageStats(
  userAccountId: string,
  input: RecordTriageStatsInput,
): Promise<void> {
  const statDate = today();
  const column = CATEGORY_COLUMN[input.finalCategory];

  const createData: Prisma.TriageSummaryStatCreateInput = {
    userAccount: { connect: { id: userAccountId } },
    statDate,
    totalEmails: 1,
    importantCount: input.finalCategory === "important" ? 1 : 0,
    fyiCount: input.finalCategory === "fyi" ? 1 : 0,
    newsletterCount: input.finalCategory === "newsletter" ? 1 : 0,
    marketingCount: input.finalCategory === "marketing" ? 1 : 0,
    receiptCount: input.finalCategory === "receipt" ? 1 : 0,
    automatedNotificationCount:
      input.finalCategory === "automated_notification" ? 1 : 0,
    flaggedLowConfidenceCount: input.flagged ? 1 : 0,
    ruleOverriddenCount: input.ruleOverridden ? 1 : 0,
  };

  const updateData: Prisma.TriageSummaryStatUpdateInput = {
    totalEmails: { increment: 1 },
    [column]: { increment: 1 },
  };
  if (input.flagged) {
    updateData.flaggedLowConfidenceCount = { increment: 1 };
  }
  if (input.ruleOverridden) {
    updateData.ruleOverriddenCount = { increment: 1 };
  }

  await prisma.triageSummaryStat.upsert({
    where: { uq_stats_user_date: { userAccountId, statDate } },
    create: createData,
    update: updateData,
  });
}

/** Increment the queue-cleared counter for today (item archived/marked done). */
export async function recordQueueCleared(userAccountId: string): Promise<void> {
  const statDate = today();
  await prisma.triageSummaryStat.upsert({
    where: { uq_stats_user_date: { userAccountId, statDate } },
    create: {
      userAccount: { connect: { id: userAccountId } },
      statDate,
      queueClearedCount: 1,
    },
    update: { queueClearedCount: { increment: 1 } },
  });
}
