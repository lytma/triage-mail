import crypto from "crypto";
import { env, features } from "@/server/lib/env";

/**
 * LLM email classifier.
 *
 * Sends ONLY metadata (sender, subject, snippet, headers) to the model —
 * never body content. When OPENAI_API_KEY is absent, a deterministic
 * heuristic classifier is used so preview works with no real keys.
 */

export type Classification =
  | "important"
  | "fyi"
  | "newsletter"
  | "marketing"
  | "receipt"
  | "automated_notification";

export interface ClassifyInput {
  senderEmail: string;
  senderName?: string;
  subject?: string;
  snippet?: string;
  headers?: Record<string, string>;
  /**
   * Preference hints learned from the user's manual "move to category"
   * corrections (the gradual AI-feedback loop). Used only by the live model;
   * the deterministic stub heuristic ignores them.
   */
  hints?: string[];
}

export interface ClassifyResult {
  classification: Classification;
  /** 0..1 */
  importanceScore: number;
  /** 0..1 */
  confidenceScore: number;
  reason: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}

const CLASSIFICATIONS: Classification[] = [
  "important",
  "fyi",
  "newsletter",
  "marketing",
  "receipt",
  "automated_notification",
];

/** Deterministic 0..1 float from a string (stable across runs). */
function hashUnit(s: string): number {
  const h = crypto.createHash("sha256").update(s).digest();
  // Use first 4 bytes as a uint32 mapped to [0,1).
  const n = h.readUInt32BE(0);
  return n / 0xffffffff;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Deterministic heuristic classifier used when OpenAI is not configured. */
export function classifyEmailHeuristic(input: ClassifyInput): ClassifyResult {
  const sender = (input.senderEmail ?? "").toLowerCase();
  const name = (input.senderName ?? "").toLowerCase();
  const subject = (input.subject ?? "").toLowerCase();
  const hay = `${sender} ${name} ${subject}`;
  const domain = sender.split("@")[1] ?? "";
  const seed = `${sender}|${subject}`;

  const has = (...needles: string[]) => needles.some((w) => hay.includes(w));

  let classification: Classification;
  let reason: string;

  if (
    has("receipt", "invoice", "order", "payment", "stripe", "no-reply@amazon") &&
    !subject.includes("invoice overdue")
  ) {
    classification = "receipt";
    reason = "Sender/subject references an order, receipt, or payment.";
  } else if (has("newsletter", "substack", "digest", "weekly")) {
    classification = "newsletter";
    reason = "Sender domain matches a known newsletter service.";
  } else if (has("promo", "marketing", "sale", "% off", "deal")) {
    classification = "marketing";
    reason = "Subject contains promotional or marketing language.";
  } else if (
    has("notification", "github", "security alert", "no-reply", "noreply", "automated", "build")
  ) {
    classification = "automated_notification";
    reason = "Message appears to be an automated system notification.";
  } else if (
    subject.includes("?") ||
    has("urgent", "contract", "invoice overdue", "meeting") ||
    looksLikePerson(sender, name, domain)
  ) {
    classification = "important";
    reason = "Sender looks like a person or the subject asks for a response.";
  } else {
    classification = "fyi";
    reason = "No strong signal; treated as informational.";
  }

  // Importance score.
  let importanceScore: number;
  if (classification === "important") {
    importanceScore = clamp(0.75 + hashUnit(seed + ":imp") * 0.2, 0.75, 0.95);
  } else {
    importanceScore = clamp(0.1 + hashUnit(seed + ":imp") * 0.4, 0.1, 0.5);
  }

  // Confidence: weak/ambiguous signals get lower confidence so SOME items are
  // low-confidence (< 0.70) and get flagged.
  const weakSignal =
    !subject.trim() ||
    (classification === "fyi" && !has("digest", "weekly", "newsletter")) ||
    (classification === "important" &&
      !subject.includes("?") &&
      !has("urgent", "contract", "meeting"));

  let confidenceScore: number;
  if (weakSignal) {
    confidenceScore = clamp(0.5 + hashUnit(seed + ":conf") * 0.18, 0.5, 0.68);
  } else {
    confidenceScore = clamp(0.75 + hashUnit(seed + ":conf") * 0.2, 0.75, 0.95);
  }

  return {
    classification,
    importanceScore: round3(importanceScore),
    confidenceScore: round3(confidenceScore),
    reason,
    model: "stub-heuristic",
  };
}

function looksLikePerson(sender: string, name: string, domain: string): boolean {
  const genericDomains = [
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
    "icloud.com",
    "proton.me",
  ];
  const local = sender.split("@")[0] ?? "";
  const noreplyish = /(no-?reply|do-?not-?reply|notifications?|mailer|bounce|automated)/.test(
    local,
  );
  if (noreplyish) return false;
  // A "firstname.lastname" or two-word display name suggests a real person.
  const nameHasSpace = name.trim().includes(" ");
  const localHasSeparator = /[._]/.test(local) && !/\d{3,}/.test(local);
  return genericDomains.includes(domain) || nameHasSpace || localHasSeparator;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---------- OpenAI live path ----------

const SYSTEM_PROMPT = `You are an email triage classifier. You receive only email METADATA (sender, subject, snippet, headers) — never the full body. Classify the email into exactly one category and rate it.

Categories:
- important: needs a personal reply or the user's attention
- fyi: informational, no action needed
- newsletter: subscribed newsletters/digests
- marketing: promotional/marketing email
- receipt: orders, invoices, payment confirmations
- automated_notification: automated system notifications (github, alerts, builds)

Respond with strict JSON: {"category": <one of the categories>, "importance": <0-100 integer>, "confidence": <0-1 float>, "reason": "<one factual sentence>"}.`;

async function classifyEmailOpenAI(input: ClassifyInput): Promise<ClassifyResult> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const userContent = JSON.stringify({
    senderEmail: input.senderEmail,
    senderName: input.senderName ?? null,
    subject: input.subject ?? null,
    snippet: input.snippet ?? null,
    headers: input.headers ?? {},
  });

  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  // Feed learned corrections as guidance so the model generalizes over time.
  if (input.hints?.length) {
    messages.push({
      role: "system",
      content:
        "Consider these learned user preferences from past manual corrections:\n" +
        input.hints.join("\n"),
    });
  }
  messages.push({ role: "user", content: userContent });

  const completion = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty classification");
  const parsed = JSON.parse(raw) as {
    category?: string;
    importance?: number;
    confidence?: number;
    reason?: string;
  };

  const classification = (
    CLASSIFICATIONS.includes(parsed.category as Classification)
      ? parsed.category
      : "fyi"
  ) as Classification;

  const importanceRaw = Number(parsed.importance ?? 0);
  const importanceScore = round3(clamp(importanceRaw / 100, 0, 1));
  const confidenceScore = round3(clamp(Number(parsed.confidence ?? 0.5), 0, 1));

  return {
    classification,
    importanceScore,
    confidenceScore,
    reason: parsed.reason ?? "Classified by the model.",
    model: env.OPENAI_MODEL,
    promptTokens: completion.usage?.prompt_tokens,
    completionTokens: completion.usage?.completion_tokens,
  };
}

/**
 * Classify an email from metadata only.
 * Throws on OpenAI error (so the worker retries). The heuristic never throws.
 */
export async function classifyEmail(input: ClassifyInput): Promise<ClassifyResult> {
  if (features.openaiLive) {
    return classifyEmailOpenAI(input);
  }
  return classifyEmailHeuristic(input);
}
