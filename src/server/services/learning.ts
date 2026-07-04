import type { TriageRule } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getFolderIdForClassification } from "@/server/services/category-folders";
import type { Classification } from "./llm";
import type { ParsedConditions } from "./rules-engine";

/**
 * Learn from a user's manual "move to category" correction.
 *
 * Two mechanisms (see product decision):
 *  1. Per-sender rule (INSTANT, visible): upsert a high-priority learned rule
 *     that routes future mail from this exact sender to the corrected category.
 *     Rules always override the AI, so the correction "sticks" on the next email
 *     from that sender.
 *  2. AI feedback signal (GRADUAL): the same learned rules are surfaced to the
 *     LLM classifier as preference hints (see buildClassifierHints), so the
 *     model generalizes corrections to similar senders over time.
 */

const LEARNED_PREFIX = "[Learned] ";
const LEARNED_PRIORITY = 100;

const CLASS_LABELS: Record<Classification, string> = {
  important: "Important",
  fyi: "FYI",
  newsletter: "Newsletters",
  marketing: "Marketing",
  receipt: "Receipts",
  automated_notification: "Automated Notifications",
};

/** True for a rule this system authored from a manual move. */
export function isLearnedRule(rule: Pick<TriageRule, "plainEnglishText">): boolean {
  return rule.plainEnglishText.startsWith(LEARNED_PREFIX);
}

/** Does this learned rule's single equals-condition target `sender`? */
function matchesSender(rule: TriageRule, sender: string): boolean {
  if (!isLearnedRule(rule)) return false;
  const conds = (rule.parsedConditions as unknown as ParsedConditions) ?? {};
  const list = conds.all ?? conds.any ?? [];
  return list.some(
    (c) => c.field === "sender_email" && c.op === "equals" && c.value === sender,
  );
}

export interface LearnResult {
  ruleId: string;
  created: boolean;
}

/**
 * Upsert a per-sender learned rule for a correction. Idempotent per (user,
 * sender): repeated corrections update the same rule's target.
 */
export async function learnFromMove(
  userAccountId: string,
  senderEmail: string,
  classification: Classification,
): Promise<LearnResult> {
  const sender = senderEmail.trim().toLowerCase();
  const targetCategoryFolderId =
    classification === "important"
      ? null
      : await getFolderIdForClassification(userAccountId, classification);

  const parsedConditions = {
    all: [{ field: "sender_email", op: "equals", value: sender }],
  };
  const plainEnglishText = `${LEARNED_PREFIX}File email from ${sender} as ${CLASS_LABELS[classification]}`;

  // Find an existing learned rule for this sender (JSON isn't cheaply queryable,
  // so scan the user's learned rules — there are few).
  const learned = await prisma.triageRule.findMany({
    where: { userAccountId, plainEnglishText: { startsWith: LEARNED_PREFIX } },
  });
  const existing = learned.find((r) => matchesSender(r, sender));

  if (existing) {
    await prisma.triageRule.update({
      where: { id: existing.id },
      data: {
        targetClassification: classification,
        targetCategoryFolderId,
        parsedConditions,
        plainEnglishText,
        isActive: true,
        priority: LEARNED_PRIORITY,
      },
    });
    return { ruleId: existing.id, created: false };
  }

  const created = await prisma.triageRule.create({
    data: {
      userAccountId,
      plainEnglishText,
      parsedConditions,
      targetClassification: classification,
      targetCategoryFolderId,
      isActive: true,
      priority: LEARNED_PRIORITY,
    },
  });
  return { ruleId: created.id, created: true };
}

/**
 * Build compact preference hints from the user's learned rules for the LLM
 * classifier (the "gradual AI feedback" path). Ignored by the stub heuristic.
 */
export function buildClassifierHints(rules: TriageRule[]): string[] {
  const hints: string[] = [];
  for (const r of rules) {
    if (!isLearnedRule(r)) continue;
    const conds = (r.parsedConditions as unknown as ParsedConditions) ?? {};
    const cond = (conds.all ?? conds.any ?? [])[0];
    if (!cond?.value) continue;
    hints.push(
      `The user files mail from "${cond.value}" as ${CLASS_LABELS[r.targetClassification as Classification]}.`,
    );
    if (hints.length >= 20) break;
  }
  return hints;
}
