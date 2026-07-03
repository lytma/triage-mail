import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { seedCategoryFolders } from "@/server/services/category-folders";
import { triageEmail } from "@/server/services/triage";
import {
  parseRuleHeuristic,
  evaluateRules,
  matchConditions,
} from "@/server/services/rules-engine";

/**
 * Integration tests against the dev Postgres (DATABASE_URL). A throwaway user
 * + mailbox is created in beforeAll and torn down (cascade) in afterAll.
 * Uses the stub LLM (no OPENAI_API_KEY) and mock.forceClassification to drive
 * deterministic branches without touching the production classify path.
 */

let userAccountId: string;
let connectedMailboxId: string;
let msgCounter = 0;

function nextMsgId(): string {
  msgCounter += 1;
  return `test-msg-${Date.now()}-${msgCounter}`;
}

beforeAll(async () => {
  const user = await prisma.userAccount.create({
    data: {
      email: `triage-test-${Date.now()}@example.com`,
      displayName: "Triage Test User",
    },
  });
  userAccountId = user.id;
  await seedCategoryFolders(userAccountId);

  const mailbox = await prisma.connectedMailbox.create({
    data: {
      userAccountId,
      provider: "gmail",
      emailAddress: `triage-test-${Date.now()}@gmail.com`,
      oauthRefreshTokenEncrypted: "", // placeholder => stub mode
      syncState: "active",
    },
  });
  connectedMailboxId = mailbox.id;
});

afterAll(async () => {
  if (userAccountId) {
    await prisma.userAccount.delete({ where: { id: userAccountId } });
  }
  await prisma.$disconnect();
});

describe("rules-engine", () => {
  it("parses a plain-English rule into conditions + summary", () => {
    const { parsedConditions, summary } = parseRuleHeuristic(
      'When sender contains "accountant" mark as important',
      "important",
    );
    expect(parsedConditions.any?.length).toBeGreaterThan(0);
    expect(summary).toContain("Important");
  });

  it("matchConditions is case-insensitive contains and handles domains", () => {
    const conds = {
      any: [{ field: "sender_domain" as const, op: "contains" as const, value: "acme.com" }],
    };
    expect(
      matchConditions(conds, { senderEmail: "bob@ACME.com", subject: "hi" }),
    ).toBe(true);
    expect(
      matchConditions(conds, { senderEmail: "bob@other.com", subject: "hi" }),
    ).toBe(false);
  });

  it("empty conditions never match", () => {
    expect(matchConditions({ any: [] }, { senderEmail: "a@b.com" })).toBe(false);
  });
});

describe("triageEmail", () => {
  it("important (no rule) creates a ReviewQueueItem + EmailMetadata + TriageDecision", async () => {
    const providerMessageId = nextMsgId();
    const result = await triageEmail({
      userAccountId,
      connectedMailboxId,
      providerMessageId,
      mock: {
        senderEmail: "jane.doe@gmail.com",
        senderName: "Jane Doe",
        subject: "Can we meet tomorrow?",
        forceClassification: {
          classification: "important",
          importanceScore: 0.9,
          confidenceScore: 0.88,
          reason: "Direct question from a person.",
        },
      },
    });

    expect(result.created).toBe(true);
    expect(result.finalCategory).toBe("important");
    expect(result.flagged).toBe(false);
    expect(result.reviewQueueItemId).toBeTruthy();

    const email = await prisma.emailMetadata.findUnique({
      where: { id: result.emailMetadataId },
      include: { triageDecision: true, reviewQueueItem: true },
    });
    expect(email).toBeTruthy();
    expect(email!.isImportant).toBe(true);
    expect(email!.categoryFolderId).toBeNull();
    expect(email!.triageDecision).toBeTruthy();
    expect(email!.triageDecision!.classification).toBe("important");
    expect(email!.triageDecision!.finalCategory).toBe("important");
    expect(email!.reviewQueueItem).toBeTruthy();
    expect(email!.reviewQueueItem!.status).toBe("pending");
  });

  it("is idempotent — re-triaging the same message returns the existing record", async () => {
    const providerMessageId = nextMsgId();
    const first = await triageEmail({
      userAccountId,
      connectedMailboxId,
      providerMessageId,
      mock: {
        senderEmail: "someone@gmail.com",
        subject: "Hello?",
        forceClassification: { classification: "important", confidenceScore: 0.9 },
      },
    });
    expect(first.created).toBe(true);

    const second = await triageEmail({
      userAccountId,
      connectedMailboxId,
      providerMessageId,
      mock: {
        senderEmail: "someone@gmail.com",
        subject: "Hello?",
        forceClassification: { classification: "receipt", confidenceScore: 0.9 },
      },
    });
    expect(second.created).toBe(false);
    expect(second.emailMetadataId).toBe(first.emailMetadataId);
    // Classification must NOT have been re-run.
    expect(second.finalCategory).toBe("important");
  });

  it("low-confidence important guess is flagged and filed in a folder, NOT the queue", async () => {
    const providerMessageId = nextMsgId();
    const result = await triageEmail({
      userAccountId,
      connectedMailboxId,
      providerMessageId,
      mock: {
        senderEmail: "ambiguous@gmail.com",
        subject: "hmm",
        forceClassification: {
          classification: "important",
          importanceScore: 0.8,
          confidenceScore: 0.55, // < 0.70
          reason: "Weak signal.",
        },
      },
    });

    expect(result.flagged).toBe(true);
    expect(result.reviewQueueItemId).toBeNull();

    const email = await prisma.emailMetadata.findUnique({
      where: { id: result.emailMetadataId },
      include: { reviewQueueItem: true },
    });
    expect(email!.isFlaggedLowConfidence).toBe(true);
    expect(email!.isImportant).toBe(false);
    expect(email!.categoryFolderId).toBeTruthy(); // filed into fyi best-guess
    expect(email!.reviewQueueItem).toBeNull();
  });

  it("low-confidence newsletter is flagged but still filed into its folder", async () => {
    const providerMessageId = nextMsgId();
    const result = await triageEmail({
      userAccountId,
      connectedMailboxId,
      providerMessageId,
      mock: {
        senderEmail: "digest@substack.com",
        subject: "",
        forceClassification: {
          classification: "newsletter",
          confidenceScore: 0.6,
        },
      },
    });
    expect(result.flagged).toBe(true);
    expect(result.finalCategory).toBe("newsletter");
    expect(result.reviewQueueItemId).toBeNull();

    const email = await prisma.emailMetadata.findUnique({
      where: { id: result.emailMetadataId },
    });
    expect(email!.categoryFolderId).toBeTruthy();
  });

  it("a matching rule overrides the AI classification and records both", async () => {
    const rule = await prisma.triageRule.create({
      data: {
        userAccountId,
        plainEnglishText: 'When sender domain contains "vendor.com" mark important',
        parsedConditions: {
          any: [{ field: "sender_domain", op: "contains", value: "vendor.com" }],
        },
        targetClassification: "important",
        priority: 10,
        isActive: true,
      },
    });

    const providerMessageId = nextMsgId();
    const result = await triageEmail({
      userAccountId,
      connectedMailboxId,
      providerMessageId,
      mock: {
        senderEmail: "billing@vendor.com",
        subject: "Your invoice",
        // AI would say receipt, but the rule forces important.
        forceClassification: {
          classification: "receipt",
          confidenceScore: 0.9,
          reason: "Looks like a receipt.",
        },
      },
    });

    expect(result.classification).toBe("receipt"); // AI decision recorded
    expect(result.finalCategory).toBe("important"); // rule wins routing
    expect(result.reviewQueueItemId).toBeTruthy();

    const decision = await prisma.triageDecision.findUnique({
      where: { emailMetadataId: result.emailMetadataId },
    });
    expect(decision!.classification).toBe("receipt");
    expect(decision!.finalCategory).toBe("important");
    expect(decision!.overriddenByRuleId).toBe(rule.id);

    await prisma.triageRule.delete({ where: { id: rule.id } });
  });

  it("a rule forcing important is NOT flagged even at low confidence", async () => {
    const rule = await prisma.triageRule.create({
      data: {
        userAccountId,
        plainEnglishText: 'When sender contains "boss@company.com"',
        parsedConditions: {
          any: [{ field: "sender_email", op: "contains", value: "boss@company.com" }],
        },
        targetClassification: "important",
        priority: 5,
        isActive: true,
      },
    });

    const providerMessageId = nextMsgId();
    const result = await triageEmail({
      userAccountId,
      connectedMailboxId,
      providerMessageId,
      mock: {
        senderEmail: "boss@company.com",
        subject: "fyi",
        forceClassification: {
          classification: "fyi",
          confidenceScore: 0.4, // low, but a rule matched => not flagged
        },
      },
    });

    expect(result.flagged).toBe(false);
    expect(result.finalCategory).toBe("important");
    expect(result.reviewQueueItemId).toBeTruthy();

    await prisma.triageRule.delete({ where: { id: rule.id } });
  });

  it("rule priority: higher priority wins over a lower one", async () => {
    const low = await prisma.triageRule.create({
      data: {
        userAccountId,
        plainEnglishText: "low priority marketing",
        parsedConditions: {
          any: [{ field: "sender_domain", op: "contains", value: "shop.com" }],
        },
        targetClassification: "marketing",
        priority: 1,
        isActive: true,
      },
    });
    const high = await prisma.triageRule.create({
      data: {
        userAccountId,
        plainEnglishText: "high priority important",
        parsedConditions: {
          any: [{ field: "sender_domain", op: "contains", value: "shop.com" }],
        },
        targetClassification: "important",
        priority: 100,
        isActive: true,
      },
    });

    // Verify evaluateRules picks the high one directly.
    const rules = await prisma.triageRule.findMany({
      where: { userAccountId, isActive: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    const match = evaluateRules(
      { senderEmail: "promo@shop.com", subject: "sale" },
      rules,
    );
    expect(match?.rule.id).toBe(high.id);

    const providerMessageId = nextMsgId();
    const result = await triageEmail({
      userAccountId,
      connectedMailboxId,
      providerMessageId,
      mock: {
        senderEmail: "promo@shop.com",
        subject: "Big sale",
        forceClassification: { classification: "marketing", confidenceScore: 0.9 },
      },
    });
    expect(result.finalCategory).toBe("important");

    await prisma.triageRule.deleteMany({ where: { id: { in: [low.id, high.id] } } });
  });

  it("records daily stats for triaged mail", async () => {
    const before = await prisma.triageSummaryStat.findFirst({
      where: { userAccountId },
      orderBy: { statDate: "desc" },
    });
    const beforeTotal = before?.totalEmails ?? 0;

    await triageEmail({
      userAccountId,
      connectedMailboxId,
      providerMessageId: nextMsgId(),
      mock: {
        senderEmail: "stats@gmail.com",
        subject: "count me",
        forceClassification: { classification: "fyi", confidenceScore: 0.9 },
      },
    });

    const after = await prisma.triageSummaryStat.findFirst({
      where: { userAccountId },
      orderBy: { statDate: "desc" },
    });
    expect((after?.totalEmails ?? 0)).toBeGreaterThan(beforeTotal);
  });
});
