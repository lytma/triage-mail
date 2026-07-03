import { handle, json } from "@/server/lib/http";
import { requireUser } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

/** GET /api/triage-stats?startDate&endDate — daily stats + summary aggregates. */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const end = url.searchParams.get("endDate")
      ? new Date(url.searchParams.get("endDate")!)
      : new Date();
    const start = url.searchParams.get("startDate")
      ? new Date(url.searchParams.get("startDate")!)
      : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const rows = await prisma.triageSummaryStat.findMany({
      where: { userAccountId: user.id, statDate: { gte: start, lte: end } },
      orderBy: { statDate: "asc" },
    });

    const dailyStats = rows.map((r) => ({
      statDate: r.statDate.toISOString().slice(0, 10),
      totalEmails: r.totalEmails,
      importantCount: r.importantCount,
      fyiCount: r.fyiCount,
      newsletterCount: r.newsletterCount,
      marketingCount: r.marketingCount,
      receiptCount: r.receiptCount,
      automatedNotificationCount: r.automatedNotificationCount,
      flaggedLowConfidenceCount: r.flaggedLowConfidenceCount,
      queueClearedCount: r.queueClearedCount,
      ruleOverriddenCount: r.ruleOverriddenCount,
    }));

    const sum = (k: keyof (typeof dailyStats)[number]) =>
      dailyStats.reduce((a, d) => a + (d[k] as number), 0);

    const totalEmails = sum("totalEmails");
    const importantTotal = sum("importantCount");
    const cleared = sum("queueClearedCount");
    const flagged = sum("flaggedLowConfidenceCount");
    const ruleOverridden = sum("ruleOverriddenCount");
    const days = Math.max(1, dailyStats.length);

    const categoryTotals = {
      important: importantTotal,
      fyi: sum("fyiCount"),
      newsletter: sum("newsletterCount"),
      marketing: sum("marketingCount"),
      receipt: sum("receiptCount"),
      automated_notification: sum("automatedNotificationCount"),
    };
    const topCategory =
      Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "important";

    // Top senders in range (by email count) with dominant category.
    const senderRows = await prisma.emailMetadata.groupBy({
      by: ["senderEmail"],
      where: { userAccountId: user.id, receivedAt: { gte: start, lte: end } },
      _count: { _all: true },
      orderBy: { _count: { senderEmail: "desc" } },
      take: 10,
    });
    const topSenders = senderRows.map((s) => ({
      senderEmail: s.senderEmail,
      count: s._count._all,
    }));

    return json({
      dailyStats,
      summary: {
        totalEmails,
        avgPerDay: Math.round(totalEmails / days),
        avgQueueClearanceRate: importantTotal > 0 ? cleared / importantTotal : 0,
        lowConfidenceRate: totalEmails > 0 ? flagged / totalEmails : 0,
        ruleVsAi: {
          rule: ruleOverridden,
          ai: Math.max(0, totalEmails - ruleOverridden),
        },
        categoryTotals,
        topCategory,
        topSenders,
      },
    });
  });
}
