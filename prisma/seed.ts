import "dotenv/config";
import bcrypt from "bcryptjs";
import type {
  Classification,
  ConnectedMailbox,
  ReviewItemStatus,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  seedCategoryFolders,
  DEFAULT_CATEGORIES,
  CLASSIFICATION_TO_SLUG,
} from "@/server/services/category-folders";
import { encryptToken } from "@/server/lib/crypto";

/**
 * Idempotent (seed-when-empty) database seed for Triage Mail.
 *
 * Behaviour:
 *  - If `admin@example.com` already exists AND FORCE_RESEED !== "true": exit early.
 *  - If FORCE_RESEED === "true": delete the two seeded users first (cascades clean
 *    up all their children) then reseed from scratch.
 *
 * Runs under tsx (not in a Workflow), so `new Date()` / `Date.now()` are allowed.
 */

const ADMIN_EMAIL = "admin@example.com";
const DEMO_EMAIL = "demo@triagemail.app";

const CLASSIFICATIONS: Classification[] = [
  "important",
  "fyi",
  "newsletter",
  "marketing",
  "receipt",
  "automated_notification",
];

// ---------- deterministic-ish helpers ----------

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A receivedAt spread over the last `maxDays` days, seeded by index. */
function receivedAtFor(index: number, maxDays = 30): Date {
  const r = rand(index + 1);
  const daysAgo = r * maxDays;
  const jitterMs = rand(index * 7 + 3) * DAY_MS;
  return new Date(now - daysAgo * DAY_MS - jitterMs);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(rand(seed) * arr.length) % arr.length];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---------- realistic content per category ----------

type Content = { senderEmail: string; senderName: string; subject: string };

const CONTENT: Record<Classification, Content[]> = {
  important: [
    { senderEmail: "sarah.chen@client.com", senderName: "Sarah Chen", subject: "Contract redlines for review" },
    { senderEmail: "devops-alerts@company.com", senderName: "DevOps Alerts", subject: "Deployment failed in production" },
    { senderEmail: "marcus.lee@partner.io", senderName: "Marcus Lee", subject: "Can we move our 1:1?" },
    { senderEmail: "billing@vendor.com", senderName: "Vendor Billing", subject: "Invoice #4821 is overdue" },
    { senderEmail: "priya.nair@client.com", senderName: "Priya Nair", subject: "Urgent: signoff needed before Friday" },
    { senderEmail: "legal@acmecorp.com", senderName: "Acme Legal", subject: "NDA amendment — action required" },
    { senderEmail: "ceo@startup.co", senderName: "Jordan Blake", subject: "Board deck feedback" },
    { senderEmail: "oncall@company.com", senderName: "On-call", subject: "PagerDuty: API latency SLO breached" },
    { senderEmail: "recruiter@bigco.com", senderName: "Dana Ruiz", subject: "Offer letter attached" },
    { senderEmail: "accounting@myaccountant.com", senderName: "Tom Fielder CPA", subject: "Q2 tax documents ready to sign" },
  ],
  fyi: [
    { senderEmail: "team@company.com", senderName: "Company Updates", subject: "Q3 roadmap shared" },
    { senderEmail: "facilities@company.com", senderName: "Facilities", subject: "Office closed Monday" },
    { senderEmail: "people@company.com", senderName: "People Team", subject: "New hire starting next week" },
    { senderEmail: "eng-weekly@company.com", senderName: "Eng Weekly", subject: "Sprint 24 summary" },
    { senderEmail: "comms@company.com", senderName: "Internal Comms", subject: "All-hands recording is up" },
    { senderEmail: "it@company.com", senderName: "IT", subject: "Scheduled VPN maintenance Thursday" },
    { senderEmail: "product@company.com", senderName: "Product", subject: "Beta feature rolling out to 10%" },
  ],
  newsletter: [
    { senderEmail: "newsletter@substack.com", senderName: "This Week in Design", subject: "This week in design" },
    { senderEmail: "crew@morningbrew.com", senderName: "Morning Brew", subject: "The Morning Brew: markets & memes" },
    { senderEmail: "ben@stratechery.com", senderName: "Stratechery", subject: "Stratechery Update: platform shifts" },
    { senderEmail: "hello@tldr.tech", senderName: "TLDR", subject: "TLDR: 5 things in tech today" },
    { senderEmail: "digest@hackernewsletter.com", senderName: "HN Newsletter", subject: "Hacker Newsletter #712" },
    { senderEmail: "news@theverge.com", senderName: "The Verge", subject: "Verge Deals: weekend roundup" },
  ],
  marketing: [
    { senderEmail: "promo@brand.com", senderName: "Brand", subject: "50% off ends tonight" },
    { senderEmail: "marketing@shop.com", senderName: "Shop", subject: "Introducing our new plan" },
    { senderEmail: "offers@travelco.com", senderName: "TravelCo", subject: "Flash sale: flights from $59" },
    { senderEmail: "hello@saasapp.io", senderName: "SaaSApp", subject: "You left something in your cart" },
    { senderEmail: "deals@gadgetstore.com", senderName: "GadgetStore", subject: "New arrivals just dropped" },
    { senderEmail: "team@fitclub.com", senderName: "FitClub", subject: "Come back — 3 months free" },
  ],
  receipt: [
    { senderEmail: "receipts@amazon.com", senderName: "Amazon", subject: "Your receipt from Amazon" },
    { senderEmail: "no-reply@stripe.com", senderName: "Stripe", subject: "Payment received - Stripe" },
    { senderEmail: "receipts@uber.com", senderName: "Uber", subject: "Uber trip receipt" },
    { senderEmail: "billing@spotify.com", senderName: "Spotify", subject: "Your Spotify Premium receipt" },
    { senderEmail: "no-reply@doordash.com", senderName: "DoorDash", subject: "Your order receipt" },
    { senderEmail: "invoice@digitalocean.com", senderName: "DigitalOcean", subject: "Invoice for June usage" },
  ],
  automated_notification: [
    { senderEmail: "notifications@github.com", senderName: "GitHub", subject: "Your build passed" },
    { senderEmail: "no-reply@google.com", senderName: "Google", subject: "Security alert: new sign-in" },
    { senderEmail: "no-reply@accounts.google.com", senderName: "Google Accounts", subject: "Password changed" },
    { senderEmail: "notify@slack.com", senderName: "Slack", subject: "You have 3 unread mentions" },
    { senderEmail: "ci@circleci.com", senderName: "CircleCI", subject: "Pipeline succeeded on main" },
    { senderEmail: "alerts@statuspage.io", senderName: "Statuspage", subject: "Incident resolved" },
  ],
};

function contentFor(classification: Classification, seed: number): Content {
  return pick(CONTENT[classification], seed);
}

// ---------- email + decision + optional review item creator ----------

let providerMsgCounter = 0;

type MakeEmailArgs = {
  userAccountId: string;
  mailbox: ConnectedMailbox;
  classification: Classification;
  index: number;
  folderIdForSlug: (slug: string) => string | undefined;
  /** For important emails, optionally create a review queue item. */
  reviewStatus?: ReviewItemStatus | null;
  /** Force a low-confidence flagged (non-important) email filed in a folder. */
  lowConfidence?: boolean;
  /** Optional rule override (id + finalCategory). */
  override?: { ruleId: string; finalCategory: Classification } | null;
};

async function makeEmail(args: MakeEmailArgs): Promise<void> {
  const {
    userAccountId,
    mailbox,
    classification,
    index,
    folderIdForSlug,
    reviewStatus = null,
    lowConfidence = false,
    override = null,
  } = args;

  const content = contentFor(classification, index * 3 + mailbox.emailAddress.length);
  const receivedAt = receivedAtFor(index);
  const isImportant = classification === "important";

  const slug = CLASSIFICATION_TO_SLUG[classification];
  const categoryFolderId = isImportant ? null : folderIdForSlug(slug) ?? null;

  const providerMessageId = `${mailbox.provider}msg-${++providerMsgCounter}`;
  const providerThreadId = `${mailbox.provider}thr-${Math.floor(index / 3) + 1}`;

  // ~30% of non-important category emails archived.
  const isArchived = !isImportant && rand(index * 11 + 5) < 0.3;
  const hasAttachments = rand(index * 5 + 2) < 0.25;

  // Marketing/newsletter senders carry a List-Unsubscribe target so the
  // one-click unsubscribe button shows in those folders.
  let unsubscribeTarget: string | null = null;
  let unsubscribeOneClick = false;
  if (classification === "marketing" || classification === "newsletter") {
    const domain = content.senderEmail.split("@")[1] ?? "example.com";
    if (rand(index * 2 + 1) < 0.6) {
      unsubscribeTarget = `https://${domain}/unsubscribe?u=${providerMsgCounter}`;
      unsubscribeOneClick = true;
    } else {
      unsubscribeTarget = `mailto:unsubscribe@${domain}?subject=unsubscribe`;
    }
  }

  const email = await prisma.emailMetadata.create({
    data: {
      userAccountId,
      connectedMailboxId: mailbox.id,
      providerMessageId,
      providerThreadId,
      senderEmail: content.senderEmail,
      senderName: content.senderName,
      subject: content.subject,
      receivedAt,
      categoryFolderId,
      isImportant,
      isFlaggedLowConfidence: lowConfidence,
      isArchived,
      hasAttachments,
      unsubscribeTarget,
      unsubscribeOneClick,
    },
  });

  // Confidence: low-confidence band for flagged, otherwise high band.
  const confidenceScore = lowConfidence
    ? round3(0.45 + rand(index * 13 + 1) * (0.68 - 0.45))
    : round3(0.72 + rand(index * 17 + 4) * (0.98 - 0.72));

  const finalCategory: Classification = override ? override.finalCategory : classification;

  await prisma.triageDecision.create({
    data: {
      emailMetadataId: email.id,
      userAccountId,
      classification,
      confidenceScore,
      reason: reasonFor(classification, content),
      finalCategory,
      overriddenByRuleId: override ? override.ruleId : null,
      llmModel: "stub-heuristic",
      llmPromptTokens: 320 + Math.floor(rand(index + 9) * 200),
      llmCompletionTokens: 40 + Math.floor(rand(index + 21) * 60),
      decidedAt: receivedAt,
    },
  });

  if (reviewStatus) {
    const cleared = reviewStatus !== "pending";
    await prisma.reviewQueueItem.create({
      data: {
        userAccountId,
        emailMetadataId: email.id,
        importanceScore: round3(0.7 + rand(index * 19 + 6) * (0.99 - 0.7)),
        status: reviewStatus,
        clearedAt: cleared ? new Date(receivedAt.getTime() + DAY_MS) : null,
      },
    });
  }
}

function reasonFor(classification: Classification, content: Content): string {
  switch (classification) {
    case "important":
      return `Sender ${content.senderEmail} matches a known contact and the subject implies an action is needed.`;
    case "fyi":
      return "Internal informational update with no direct action requested.";
    case "newsletter":
      return "Recurring editorial newsletter from a subscribed sender.";
    case "marketing":
      return "Promotional content with a clear call to action and unsubscribe footer.";
    case "receipt":
      return "Transactional receipt confirming a completed payment.";
    case "automated_notification":
      return "Automated service notification generated by a machine sender.";
    default:
      return "Classified by heuristic.";
  }
}

// ---------- summary stats generator ----------

async function seedSummaryStats(userAccountId: string): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let d = 0; d < 30; d++) {
    const statDate = new Date(today.getTime() - d * DAY_MS);
    const s = d + 1;
    const total = 20 + Math.floor(rand(s * 3) * 41); // 20..60
    // Split across categories.
    const important = Math.floor(total * 0.12);
    const fyi = Math.floor(total * 0.15);
    const newsletter = Math.floor(total * 0.18);
    const marketing = Math.floor(total * 0.22);
    const receipt = Math.floor(total * 0.13);
    const automated =
      total - important - fyi - newsletter - marketing - receipt;
    await prisma.triageSummaryStat.create({
      data: {
        userAccountId,
        statDate,
        totalEmails: total,
        importantCount: important,
        fyiCount: fyi,
        newsletterCount: newsletter,
        marketingCount: marketing,
        receiptCount: receipt,
        automatedNotificationCount: automated,
        flaggedLowConfidenceCount: Math.floor(rand(s * 5) * 4), // 0..3
        queueClearedCount: 5 + Math.floor(rand(s * 7) * 16), // 5..20
        ruleOverriddenCount: Math.floor(rand(s * 9) * 6), // 0..5
      },
    });
  }
}

// ---------- folder lookup helper ----------

async function folderLookup(
  userAccountId: string,
): Promise<(slug: string) => string | undefined> {
  const folders = await prisma.categoryFolder.findMany({
    where: { userAccountId },
  });
  const map = new Map(folders.map((f) => [f.slug, f.id]));
  return (slug: string) => map.get(slug);
}

// ---------- ADMIN seed ----------

async function seedAdmin(): Promise<void> {
  const passwordHash = await bcrypt.hash("Admin!2345", 10);

  const admin = await prisma.userAccount.create({
    data: {
      email: ADMIN_EMAIL,
      displayName: "Alex Morgan",
      passwordHash,
      isAdmin: true,
      isDemo: false,
      authProvider: "google",
      authProviderSubject: "seed-admin",
      // Free single-user tool — no billing/trial.
      subscriptionStatus: "active",
    },
  });

  await seedCategoryFolders(admin.id);
  const folderIdForSlug = await folderLookup(admin.id);

  // Mailboxes.
  const gmail = await prisma.connectedMailbox.create({
    data: {
      userAccountId: admin.id,
      provider: "gmail",
      emailAddress: "alex.morgan@gmail.com",
      oauthRefreshTokenEncrypted: encryptToken("seed-gmail-refresh-token-admin"),
      syncState: "active",
      lastSyncedAt: new Date(now - 2 * 60 * 60 * 1000),
      providerHistoryId: "hist-admin-gmail-1",
    },
  });
  const outlook = await prisma.connectedMailbox.create({
    data: {
      userAccountId: admin.id,
      provider: "outlook",
      emailAddress: "alex@contoso.com",
      oauthRefreshTokenEncrypted: encryptToken("seed-outlook-refresh-token-admin"),
      syncState: "active",
      lastSyncedAt: new Date(now - 5 * 60 * 60 * 1000),
      providerHistoryId: "hist-admin-outlook-1",
    },
  });
  // An IMAP mailbox (iCloud) — placeholder app password keeps it in stub mode.
  const icloud = await prisma.connectedMailbox.create({
    data: {
      userAccountId: admin.id,
      provider: "imap",
      emailAddress: "alex.morgan@icloud.com",
      oauthRefreshTokenEncrypted: encryptToken("seed-imap-app-password-placeholder"),
      syncState: "active",
      lastSyncedAt: new Date(now - 3 * 60 * 60 * 1000),
    },
  });
  const mailboxes = [gmail, outlook, icloud];

  // Rules.
  const ruleAccountant = await prisma.triageRule.create({
    data: {
      userAccountId: admin.id,
      plainEnglishText: "Always mark emails from my accountant as important",
      parsedConditions: {
        any: [
          { field: "sender_domain", op: "contains", value: "accountant" },
          { field: "sender_email", op: "contains", value: "accounting" },
        ],
      },
      targetClassification: "important",
      priority: 10,
      isActive: true,
    },
  });
  const ruleMarketing = await prisma.triageRule.create({
    data: {
      userAccountId: admin.id,
      plainEnglishText: "Treat anything from marketing@ as marketing",
      parsedConditions: {
        any: [{ field: "sender_email", op: "contains", value: "marketing@" }],
      },
      targetClassification: "marketing",
      targetCategoryFolderId: folderIdForSlug("marketing") ?? null,
      priority: 5,
      isActive: true,
    },
  });
  // A learned rule from a past manual "move to category" correction.
  await prisma.triageRule.create({
    data: {
      userAccountId: admin.id,
      plainEnglishText: "[Learned] File email from deals@gadgetstore.com as Marketing",
      parsedConditions: {
        all: [{ field: "sender_email", op: "equals", value: "deals@gadgetstore.com" }],
      },
      targetClassification: "marketing",
      targetCategoryFolderId: folderIdForSlug("marketing") ?? null,
      priority: 100,
      isActive: true,
    },
  });

  // ~120 emails across categories and 2 mailboxes.
  // Distribution: important 20, fyi 20, newsletter 20, marketing 22, receipt 18, automated 20 = 120.
  const adminPlan: { classification: Classification; count: number }[] = [
    { classification: "important", count: 20 },
    { classification: "fyi", count: 20 },
    { classification: "newsletter", count: 20 },
    { classification: "marketing", count: 22 },
    { classification: "receipt", count: 18 },
    { classification: "automated_notification", count: 20 },
  ];

  let idx = 0;
  let importantSeen = 0;
  let lowConfMade = 0;
  const targetPending = 14;
  const clearedStatuses: ReviewItemStatus[] = ["archived", "done", "replied"];
  let clearedMade = 0;

  for (const { classification, count } of adminPlan) {
    for (let i = 0; i < count; i++) {
      const mailbox = mailboxes[idx % mailboxes.length];
      idx++;

      let reviewStatus: ReviewItemStatus | null = null;
      let lowConfidence = false;
      let override: { ruleId: string; finalCategory: Classification } | null = null;

      if (classification === "important") {
        importantSeen++;
        if (importantSeen <= targetPending) {
          reviewStatus = "pending";
        } else if (clearedMade < 4) {
          reviewStatus = clearedStatuses[clearedMade % clearedStatuses.length];
          clearedMade++;
        }
        // A few important ones overridden by the accountant rule.
        if (importantSeen % 9 === 0) {
          override = { ruleId: ruleAccountant.id, finalCategory: "important" };
        }
      } else {
        // Make ~4 low-confidence flagged (filed in folder, not important).
        if (lowConfMade < 4 && i === 1) {
          lowConfidence = true;
          lowConfMade++;
        }
        // A few marketing ones overridden by the marketing rule.
        if (classification === "marketing" && i % 7 === 0) {
          override = { ruleId: ruleMarketing.id, finalCategory: "marketing" };
        }
      }

      await makeEmail({
        userAccountId: admin.id,
        mailbox,
        classification,
        index: idx,
        folderIdForSlug,
        reviewStatus,
        lowConfidence,
        override,
      });
    }
  }

  await seedSummaryStats(admin.id);

  // Notification subscription.
  await prisma.notificationSubscription.create({
    data: {
      userAccountId: admin.id,
      endpoint: "https://seed.example/push/admin",
      p256dhKey: "seed-p256dh-key-admin",
      authSecret: "seed-auth-secret-admin",
      isActive: true,
    },
  });

  // Events over last 14 days.
  const eventNames = [
    { name: "review_queue_opened", props: {} },
    { name: "email_triaged", props: { category: "marketing" } },
    { name: "review_queue_cleared", props: {} },
    { name: "mailbox_connected", props: { provider: "gmail" } },
    { name: "rule_created", props: {} },
    { name: "email_moved", props: { to: "marketing", learned_rule: "created" } },
    { name: "email_unsubscribe_requested", props: { category: "marketing", one_click: true } },
    { name: "email_triaged", props: { category: "receipt" } },
    { name: "mailbox_connected", props: { provider: "outlook" } },
    { name: "review_queue_cleared", props: {} },
    { name: "email_triaged", props: { category: "important" } },
  ];
  await prisma.event.createMany({
    data: eventNames.map((e, i) => ({
      userId: admin.id,
      name: e.name,
      occurredAt: new Date(now - rand(i + 1) * 14 * DAY_MS),
      props: e.props,
    })),
  });
}

// ---------- DEMO seed ----------

async function seedDemo(): Promise<void> {
  const passwordHash = await bcrypt.hash("demo-no-login", 10);

  const demo = await prisma.userAccount.create({
    data: {
      email: DEMO_EMAIL,
      displayName: "Demo User",
      passwordHash,
      isAdmin: false,
      isDemo: true,
      subscriptionStatus: "active",
    },
  });

  await prisma.demoAccount.create({
    data: {
      demoToken: "demo",
      displayName: "Demo User",
      seedDataSnapshot: {},
      isActive: true,
      expiresAt: null,
    },
  });

  await seedCategoryFolders(demo.id);
  const folderIdForSlug = await folderLookup(demo.id);

  const mailboxDefs: { provider: "gmail" | "outlook" | "imap"; email: string }[] = [
    { provider: "gmail", email: "demo.work@gmail.com" },
    { provider: "gmail", email: "demo.personal@gmail.com" },
    { provider: "outlook", email: "demo@outlook.com" },
    { provider: "imap", email: "demo@icloud.com" },
  ];
  const mailboxes: ConnectedMailbox[] = [];
  for (const [i, def] of mailboxDefs.entries()) {
    mailboxes.push(
      await prisma.connectedMailbox.create({
        data: {
          userAccountId: demo.id,
          provider: def.provider,
          emailAddress: def.email,
          oauthRefreshTokenEncrypted: encryptToken(`seed-refresh-demo-${i}`),
          syncState: "active",
          lastSyncedAt: new Date(now - (i + 1) * 60 * 60 * 1000),
          providerHistoryId: `hist-demo-${def.provider}-${i}`,
        },
      }),
    );
  }

  // Rules mirroring PRD examples.
  await prisma.triageRule.create({
    data: {
      userAccountId: demo.id,
      plainEnglishText: "Always mark emails from ceo@democompany.com as important",
      parsedConditions: {
        any: [{ field: "sender_email", op: "equals", value: "ceo@democompany.com" }],
      },
      targetClassification: "important",
      priority: 10,
      isActive: true,
    },
  });
  await prisma.triageRule.create({
    data: {
      userAccountId: demo.id,
      plainEnglishText: "Treat emails from marketing@democompany.com as marketing",
      parsedConditions: {
        any: [{ field: "sender_email", op: "equals", value: "marketing@democompany.com" }],
      },
      targetClassification: "marketing",
      targetCategoryFolderId: folderIdForSlug("marketing") ?? null,
      priority: 5,
      isActive: true,
    },
  });

  // 205 emails: marketing 45, newsletter 35, receipt 20, fyi 30, automated 25, important 20 = 175
  // Top up to exceed 200 with extra marketing/newsletter/fyi.
  const demoPlan: { classification: Classification; count: number }[] = [
    { classification: "marketing", count: 45 },
    { classification: "newsletter", count: 35 },
    { classification: "receipt", count: 20 },
    { classification: "fyi", count: 30 },
    { classification: "automated_notification", count: 25 },
    { classification: "important", count: 20 },
    // top-up to exceed 200 total (175 -> 210)
    { classification: "marketing", count: 15 },
    { classification: "newsletter", count: 10 },
    { classification: "fyi", count: 10 },
  ];

  let idx = 0;
  let importantSeen = 0;
  let lowConfMade = 0;
  const targetPending = 15;

  for (const { classification, count } of demoPlan) {
    for (let i = 0; i < count; i++) {
      const mailbox = mailboxes[idx % mailboxes.length];
      idx++;

      let reviewStatus: ReviewItemStatus | null = null;
      let lowConfidence = false;

      if (classification === "important") {
        importantSeen++;
        // Exactly 15 pending review items from important (not flagged).
        if (importantSeen <= targetPending) {
          reviewStatus = "pending";
        }
      } else {
        // At least 2 low-confidence flagged items in category folders.
        if (lowConfMade < 2 && i === 2) {
          lowConfidence = true;
          lowConfMade++;
        }
      }

      await makeEmail({
        userAccountId: demo.id,
        mailbox,
        classification,
        index: 1000 + idx,
        folderIdForSlug,
        reviewStatus,
        lowConfidence,
      });
    }
  }

  await seedSummaryStats(demo.id);
}

// ---------- delete seeded users (FORCE_RESEED) ----------

async function deleteSeededUsers(): Promise<void> {
  // demo_accounts is not FK-linked to user_accounts, so remove it explicitly.
  await prisma.demoAccount.deleteMany({ where: { demoToken: "demo" } });
  // Cascades clean up all children of these users.
  await prisma.userAccount.deleteMany({
    where: { email: { in: [ADMIN_EMAIL, DEMO_EMAIL] } },
  });
}

// ---------- main ----------

async function main(): Promise<void> {
  const forceReseed = process.env.FORCE_RESEED === "true";
  const existingAdmin = await prisma.userAccount.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existingAdmin && !forceReseed) {
    console.log(
      `[seed] ${ADMIN_EMAIL} already exists and FORCE_RESEED != "true" — nothing to do (idempotent no-op).`,
    );
    return;
  }

  if (forceReseed) {
    console.log("[seed] FORCE_RESEED=true — deleting existing seeded users…");
    await deleteSeededUsers();
  }

  console.log("[seed] Seeding admin account…");
  await seedAdmin();
  console.log("[seed] Seeding demo account…");
  await seedDemo();

  // Summary counts.
  const [
    users,
    subscriptions,
    ledger,
    mailboxes,
    folders,
    emails,
    decisions,
    reviewItems,
    rules,
    stats,
    demoAccounts,
    notifSubs,
    events,
  ] = await Promise.all([
    prisma.userAccount.count(),
    prisma.subscription.count(),
    prisma.subscriptionLedgerEntry.count(),
    prisma.connectedMailbox.count(),
    prisma.categoryFolder.count(),
    prisma.emailMetadata.count(),
    prisma.triageDecision.count(),
    prisma.reviewQueueItem.count(),
    prisma.triageRule.count(),
    prisma.triageSummaryStat.count(),
    prisma.demoAccount.count(),
    prisma.notificationSubscription.count(),
    prisma.event.count(),
  ]);

  const pendingReview = await prisma.reviewQueueItem.count({
    where: { status: "pending" },
  });
  const flaggedLowConf = await prisma.emailMetadata.count({
    where: { isFlaggedLowConfidence: true },
  });

  console.log("\n[seed] Done. Row counts:");
  console.table({
    userAccounts: users,
    subscriptions,
    ledgerEntries: ledger,
    connectedMailboxes: mailboxes,
    categoryFolders: folders,
    emailMetadata: emails,
    triageDecisions: decisions,
    reviewQueueItems: reviewItems,
    reviewQueuePending: pendingReview,
    flaggedLowConfidence: flaggedLowConf,
    triageRules: rules,
    triageSummaryStats: stats,
    demoAccounts,
    notificationSubscriptions: notifSubs,
    events,
  });
}

main()
  .catch((err) => {
    console.error("[seed] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
