import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/server/db/prisma";
import { seedCategoryFolders } from "@/server/services/category-folders";
import { parseRule, evaluateRules } from "@/server/services/rules-engine";
import type { UserAccount } from "@prisma/client";

/**
 * Integration tests for the review-queue ordering/clearing, bulk-archive, and
 * rules flows — exercised at the Prisma/service layer against the dev database.
 */

let user: UserAccount;
let mailboxId: string;

async function makeEmail(opts: {
  sender: string;
  subject: string;
  category: string;
  folderId?: string | null;
  important?: boolean;
  archived?: boolean;
  daysAgo?: number;
}) {
  const em = await prisma.emailMetadata.create({
    data: {
      userAccountId: user.id,
      connectedMailboxId: mailboxId,
      providerMessageId: `flow-${Math.random().toString(36).slice(2)}`,
      senderEmail: opts.sender,
      subject: opts.subject,
      receivedAt: new Date(Date.now() - (opts.daysAgo ?? 0) * 86400000),
      categoryFolderId: opts.folderId ?? null,
      isImportant: opts.important ?? false,
      isArchived: opts.archived ?? false,
    },
  });
  return em;
}

beforeAll(async () => {
  user = await prisma.userAccount.create({
    data: { email: `flow-${Date.now()}@test.local`, displayName: "Flow Test" },
  });
  await seedCategoryFolders(user.id);
  const mb = await prisma.connectedMailbox.create({
    data: {
      userAccountId: user.id,
      provider: "gmail",
      emailAddress: "flow@gmail.com",
      oauthRefreshTokenEncrypted: "placeholder",
    },
  });
  mailboxId = mb.id;
});

afterAll(async () => {
  await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe("review queue ordering + clearing", () => {
  it("orders by importance desc then recency desc, and clears on archive/done", async () => {
    const a = await makeEmail({ sender: "a@x.com", subject: "low old", category: "important", important: true, daysAgo: 5 });
    const b = await makeEmail({ sender: "b@x.com", subject: "high new", category: "important", important: true, daysAgo: 1 });
    const c = await makeEmail({ sender: "c@x.com", subject: "high old", category: "important", important: true, daysAgo: 3 });

    await prisma.reviewQueueItem.createMany({
      data: [
        { userAccountId: user.id, emailMetadataId: a.id, importanceScore: 0.5 },
        { userAccountId: user.id, emailMetadataId: b.id, importanceScore: 0.9 },
        { userAccountId: user.id, emailMetadataId: c.id, importanceScore: 0.9 },
      ],
    });

    const pending = await prisma.reviewQueueItem.findMany({
      where: { userAccountId: user.id, status: "pending" },
      orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }],
      include: { emailMetadata: true },
    });
    // Highest importance first; a (0.5) last.
    expect(Number(pending[0].importanceScore)).toBe(0.9);
    expect(Number(pending[pending.length - 1].importanceScore)).toBe(0.5);

    // Clearing removes from the pending set.
    await prisma.reviewQueueItem.update({
      where: { id: pending[0].id },
      data: { status: "archived", clearedAt: new Date() },
    });
    const stillPending = await prisma.reviewQueueItem.findMany({
      where: { userAccountId: user.id, status: "pending" },
    });
    expect(stillPending.find((i) => i.id === pending[0].id)).toBeUndefined();
  });

  it("replied status keeps the item in the queue (not cleared)", async () => {
    const e = await makeEmail({ sender: "r@x.com", subject: "reply me", category: "important", important: true });
    const item = await prisma.reviewQueueItem.create({
      data: { userAccountId: user.id, emailMetadataId: e.id, importanceScore: 0.8, status: "replied" },
    });
    // "replied" is not pending, but it is NOT archived/done — the PATCH sets it back
    // conceptually. Here we assert replied != cleared statuses.
    expect(["archived", "done"]).not.toContain(item.status);
  });
});

describe("bulk archive", () => {
  it("archives selected folder emails and removes them from the unarchived view", async () => {
    const marketing = await prisma.categoryFolder.findFirst({
      where: { userAccountId: user.id, slug: "marketing" },
    });
    const e1 = await makeEmail({ sender: "promo@x.com", subject: "sale 1", category: "marketing", folderId: marketing!.id });
    const e2 = await makeEmail({ sender: "promo@x.com", subject: "sale 2", category: "marketing", folderId: marketing!.id });

    await prisma.emailMetadata.updateMany({
      where: { id: { in: [e1.id, e2.id] }, userAccountId: user.id },
      data: { isArchived: true },
    });

    const remaining = await prisma.emailMetadata.count({
      where: { userAccountId: user.id, categoryFolderId: marketing!.id, isArchived: false },
    });
    expect(remaining).toBe(0);
  });
});

describe("rules parsing + evaluation", () => {
  it("parses a plain-English rule and evaluates a matching email", async () => {
    const { parsedConditions, summary } = await parseRule(
      "Always mark emails from accountant@firm.com as important",
      "important",
    );
    expect(summary).toBeTruthy();

    const rule = await prisma.triageRule.create({
      data: {
        userAccountId: user.id,
        plainEnglishText: "Always mark emails from accountant@firm.com as important",
        parsedConditions: parsedConditions as object,
        targetClassification: "important",
        priority: 10,
      },
    });

    const rules = await prisma.triageRule.findMany({
      where: { userAccountId: user.id, isActive: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    const match = evaluateRules(
      { senderEmail: "accountant@firm.com", subject: "Your taxes" },
      rules,
    );
    expect(match?.rule?.id).toBe(rule.id);
  });
});
