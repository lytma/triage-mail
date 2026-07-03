import type { TriageRule } from "@prisma/client";
import { env, features } from "@/server/lib/env";
import type { Classification } from "./llm";

/**
 * Plain-English triage rule parsing + evaluation.
 *
 * Rules override AI on NEW incoming mail only (the triage engine's idempotency
 * guard prevents retroactive re-triage). Parsing is LLM-assisted when OpenAI is
 * configured, otherwise a deterministic heuristic extractor is used.
 */

export type ConditionField = "sender_email" | "sender_domain" | "subject";
export type ConditionOp = "contains" | "equals";

export interface Condition {
  field: ConditionField;
  op: ConditionOp;
  value: string;
}

export interface ParsedConditions {
  any?: Condition[];
  all?: Condition[];
}

export interface ParseRuleResult {
  parsedConditions: ParsedConditions;
  summary: string;
}

const CLASS_LABELS: Record<Classification, string> = {
  important: "Important",
  fyi: "FYI",
  newsletter: "Newsletters",
  marketing: "Marketing",
  receipt: "Receipts",
  automated_notification: "Automated Notifications",
};

// ---------- Parsing ----------

/** Extract a quoted value, e.g. `"accountant"`. */
function extractQuoted(text: string): string[] {
  const out: string[] = [];
  const re = /["'“”]([^"'“”]+)["'“”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = m[1].trim();
    if (v) out.push(v);
  }
  return out;
}

/** Heuristic parse of plain-English rule text into conditions. */
export function parseRuleHeuristic(
  plainEnglishText: string,
  targetClassification: Classification,
): ParseRuleResult {
  const text = plainEnglishText.trim();
  const lower = text.toLowerCase();
  const conditions: Condition[] = [];

  // Domain conditions: things that look like a domain (contain a dot, no space).
  const domainRe = /(?:from|domain|@)\s*[:]?\s*([a-z0-9.-]+\.[a-z]{2,})/gi;
  let dm: RegExpExecArray | null;
  const seenDomains = new Set<string>();
  while ((dm = domainRe.exec(text)) !== null) {
    const d = dm[1].toLowerCase();
    if (!seenDomains.has(d)) {
      seenDomains.add(d);
      conditions.push({ field: "sender_domain", op: "contains", value: d });
    }
  }

  // Quoted keyword targets. Decide field by nearby context.
  const quoted = extractQuoted(text);
  for (const q of quoted) {
    if (q.includes("@") || (q.includes(".") && !q.includes(" "))) {
      // Looks like an address/domain.
      if (q.includes("@")) {
        conditions.push({ field: "sender_email", op: "contains", value: q.toLowerCase() });
      } else {
        conditions.push({ field: "sender_domain", op: "contains", value: q.toLowerCase() });
      }
    } else {
      // Subject vs sender keyword based on surrounding words.
      const idx = lower.indexOf(q.toLowerCase());
      const context = lower.slice(Math.max(0, idx - 30), idx);
      if (context.includes("subject") || context.includes("title")) {
        conditions.push({ field: "subject", op: "contains", value: q });
      } else if (context.includes("sender") || context.includes("from") || context.includes("email")) {
        conditions.push({ field: "sender_email", op: "contains", value: q });
      } else {
        // Default: match sender OR subject would require two conditions; pick
        // sender_email as the more common intent for "when X" rules.
        conditions.push({ field: "sender_email", op: "contains", value: q });
      }
    }
  }

  // Bare "subject contains WORD" / "sender contains WORD" without quotes.
  if (conditions.length === 0) {
    const bare = lower.match(
      /(subject|sender|from|email|domain)\s+(?:contains?|includes?|has|with|mentions?)\s+([a-z0-9@.\- ]+?)(?:$|[,.])/,
    );
    if (bare) {
      const kind = bare[1];
      const value = bare[2].trim();
      if (value) {
        const field: ConditionField =
          kind === "subject"
            ? "subject"
            : kind === "domain"
              ? "sender_domain"
              : "sender_email";
        conditions.push({ field, op: "contains", value });
      }
    }
  }

  const label = CLASS_LABELS[targetClassification];

  if (conditions.length === 0) {
    return {
      parsedConditions: { any: [] },
      summary: `Rule text was ambiguous and matched no conditions → ${label}.`,
    };
  }

  const first = conditions[0];
  const fieldLabel =
    first.field === "subject"
      ? "subject"
      : first.field === "sender_domain"
        ? "sender domain"
        : "sender";
  const summary = `When ${fieldLabel} contains "${first.value}" → ${label}.`;

  return { parsedConditions: { any: conditions }, summary };
}

const RULE_SYSTEM_PROMPT = `You convert a plain-English email triage rule into structured JSON conditions.
Output strict JSON: {"any": [{"field": "sender_email"|"sender_domain"|"subject", "op": "contains"|"equals", "value": "<string>"}], "summary": "<human readable one line>"}.
Use "any" for OR semantics. Use lowercase values for sender/domain. If nothing is parseable, return {"any": [], "summary": "ambiguous"}.`;

async function parseRuleOpenAI(
  plainEnglishText: string,
  targetClassification: Classification,
): Promise<ParseRuleResult> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: RULE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Rule: ${plainEnglishText}\nTarget classification: ${targetClassification}`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty rule parse");
  const parsed = JSON.parse(raw) as {
    any?: Condition[];
    all?: Condition[];
    summary?: string;
  };
  const parsedConditions: ParsedConditions = {};
  if (Array.isArray(parsed.any)) parsedConditions.any = parsed.any;
  if (Array.isArray(parsed.all)) parsedConditions.all = parsed.all;
  if (!parsedConditions.any && !parsedConditions.all) parsedConditions.any = [];
  return {
    parsedConditions,
    summary:
      parsed.summary ||
      `${CLASS_LABELS[targetClassification]} rule (parsed).`,
  };
}

/** Parse plain-English rule text into conditions + a human summary. */
export async function parseRule(
  plainEnglishText: string,
  targetClassification: Classification,
): Promise<ParseRuleResult> {
  if (features.openaiLive) {
    try {
      return await parseRuleOpenAI(plainEnglishText, targetClassification);
    } catch {
      // Fall back to heuristic if the model call fails during parse.
      return parseRuleHeuristic(plainEnglishText, targetClassification);
    }
  }
  return parseRuleHeuristic(plainEnglishText, targetClassification);
}

// ---------- Evaluation ----------

interface EmailFields {
  senderEmail: string;
  senderName?: string;
  subject?: string;
}

function fieldValue(field: ConditionField, email: EmailFields): string {
  const sender = (email.senderEmail ?? "").toLowerCase();
  switch (field) {
    case "sender_email":
      return sender;
    case "sender_domain":
      return sender.split("@")[1] ?? "";
    case "subject":
      return (email.subject ?? "").toLowerCase();
  }
}

function matchOne(cond: Condition, email: EmailFields): boolean {
  const actual = fieldValue(cond.field, email);
  const expected = (cond.value ?? "").toLowerCase();
  if (!expected) return false;
  return cond.op === "equals" ? actual === expected : actual.includes(expected);
}

/** True if the conditions match the email (any = OR, all = AND). */
export function matchConditions(
  conditions: ParsedConditions | null | undefined,
  email: EmailFields,
): boolean {
  if (!conditions) return false;
  const anyList = conditions.any ?? [];
  const allList = conditions.all ?? [];
  if (anyList.length === 0 && allList.length === 0) return false;

  const anyOk = anyList.length === 0 || anyList.some((c) => matchOne(c, email));
  const allOk = allList.length === 0 || allList.every((c) => matchOne(c, email));

  // If both are present, both groups must be satisfied.
  if (anyList.length > 0 && allList.length > 0) return anyOk && allOk;
  if (anyList.length > 0) return anyOk;
  return allOk;
}

export interface RuleMatch {
  rule: TriageRule;
  conditions: ParsedConditions;
}

/**
 * Return the FIRST matching rule. `rules` MUST already be sorted by
 * priority DESC then createdAt DESC (ties → most recently created wins).
 */
export function evaluateRules(
  email: EmailFields,
  rules: TriageRule[],
): RuleMatch | null {
  for (const rule of rules) {
    if (!rule.isActive) continue;
    const conditions = (rule.parsedConditions as unknown as ParsedConditions) ?? {};
    if (matchConditions(conditions, email)) {
      return { rule, conditions };
    }
  }
  return null;
}
