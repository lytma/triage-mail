import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { UserAccount } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { seedCategoryFolders } from "@/server/services/category-folders";
import { learnFromMove, buildClassifierHints, isLearnedRule } from "@/server/services/learning";
import { evaluateRules } from "@/server/services/rules-engine";
import { parseListUnsubscribe } from "@/server/lib/unsubscribe";
import { detectImapSettings, isKnownImapDomain } from "@/server/lib/imap-config";

/**
 * Tests for the new features: learn-from-move (per-sender rule + AI hints),
 * List-Unsubscribe parsing, and IMAP server auto-detection.
 */

describe("parseListUnsubscribe", () => {
  it("prefers a one-click HTTPS endpoint when List-Unsubscribe-Post is present", () => {
    const r = parseListUnsubscribe({
      "list-unsubscribe": "<mailto:u@x.com>, <https://x.com/u?t=1>",
      "list-unsubscribe-post": "List-Unsubscribe=One-Click",
    });
    expect(r.target).toBe("https://x.com/u?t=1");
    expect(r.oneClick).toBe(true);
  });

  it("falls back to mailto when there is no HTTPS link", () => {
    const r = parseListUnsubscribe({ "list-unsubscribe": "<mailto:unsub@x.com?subject=stop>" });
    expect(r.target).toBe("mailto:unsub@x.com?subject=stop");
    expect(r.oneClick).toBe(false);
  });

  it("returns nulls when the header is absent", () => {
    expect(parseListUnsubscribe({})).toEqual({ target: null, oneClick: false });
    expect(parseListUnsubscribe(undefined)).toEqual({ target: null, oneClick: false });
  });
});

describe("detectImapSettings", () => {
  it("resolves published hosts for known providers", () => {
    expect(detectImapSettings("me@icloud.com").imapHost).toBe("imap.mail.me.com");
    expect(detectImapSettings("me@yahoo.com").imapHost).toBe("imap.mail.yahoo.com");
    expect(detectImapSettings("me@fastmail.com").smtpHost).toBe("smtp.fastmail.com");
    expect(isKnownImapDomain("me@icloud.com")).toBe(true);
  });

  it("falls back to the imap./smtp. convention for unknown domains", () => {
    const s = detectImapSettings("me@customdomain.dev");
    expect(s.imapHost).toBe("imap.customdomain.dev");
    expect(s.smtpHost).toBe("smtp.customdomain.dev");
    expect(isKnownImapDomain("me@customdomain.dev")).toBe(false);
  });
});

describe("learn from manual moves", () => {
  let user: UserAccount;

  beforeAll(async () => {
    user = await prisma.userAccount.create({
      data: { email: `learn-${Date.now()}@test.local`, displayName: "Learn Test" },
    });
    await seedCategoryFolders(user.id);
  });

  afterAll(async () => {
    await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("creates a per-sender learned rule that overrides future mail from that sender", async () => {
    const first = await learnFromMove(user.id, "Promo@Shop.com", "marketing");
    expect(first.created).toBe(true);

    const rules = await prisma.triageRule.findMany({
      where: { userAccountId: user.id, isActive: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    const match = evaluateRules({ senderEmail: "promo@shop.com", subject: "Sale!" }, rules);
    expect(match?.rule.id).toBe(first.ruleId);
    expect(match?.rule.targetClassification).toBe("marketing");
    expect(isLearnedRule(match!.rule)).toBe(true);
  });

  it("is idempotent per sender — a later correction updates the same rule", async () => {
    const again = await learnFromMove(user.id, "promo@shop.com", "newsletter");
    expect(again.created).toBe(false);

    const rule = await prisma.triageRule.findUnique({ where: { id: again.ruleId } });
    expect(rule?.targetClassification).toBe("newsletter");

    const learnedCount = await prisma.triageRule.count({
      where: { userAccountId: user.id, plainEnglishText: { startsWith: "[Learned] " } },
    });
    expect(learnedCount).toBe(1);
  });

  it("surfaces learned rules as classifier hints for the gradual AI feedback loop", async () => {
    const rules = await prisma.triageRule.findMany({ where: { userAccountId: user.id } });
    const hints = buildClassifierHints(rules);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.includes("promo@shop.com"))).toBe(true);
  });
});
