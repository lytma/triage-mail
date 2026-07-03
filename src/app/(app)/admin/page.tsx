import { redirect } from "next/navigation";
import { format, startOfDay, subDays } from "date-fns";
import { getSessionUser } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/admin/sparkline";
import { ExportButton, type ExportStat } from "@/components/admin/export-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin metrics — Triage Mail",
};

const KEY_EVENTS: { name: string; label: string }[] = [
  { name: "review_queue_opened", label: "Review queue opened" },
  { name: "email_triaged", label: "Emails triaged" },
  { name: "review_queue_cleared", label: "Review queue cleared" },
  { name: "mailbox_connected", label: "Mailbox connected" },
  { name: "rule_created", label: "Rule created" },
  { name: "subscription_started", label: "Subscription started" },
  { name: "demo_account_opened", label: "Demo account opened" },
  { name: "category_bulk_archived", label: "Category bulk-archived" },
  { name: "item_replied", label: "Item replied" },
  { name: "item_forwarded", label: "Item forwarded" },
  { name: "push_subscribed", label: "Push subscribed" },
];

const CATEGORY_ROWS: { key: keyof CategoryTotals; label: string }[] = [
  { key: "importantCount", label: "Important" },
  { key: "fyiCount", label: "FYI" },
  { key: "newsletterCount", label: "Newsletters" },
  { key: "marketingCount", label: "Marketing" },
  { key: "receiptCount", label: "Receipts" },
  { key: "automatedNotificationCount", label: "Automated notifications" },
];

interface CategoryTotals {
  importantCount: number;
  fyiCount: number;
  newsletterCount: number;
  marketingCount: number;
  receiptCount: number;
  automatedNotificationCount: number;
}

const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : "—");

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user || !user.isAdmin) redirect("/review");

  const now = new Date();
  const since30 = startOfDay(subDays(now, 29));
  const since7 = startOfDay(subDays(now, 6));

  // --- North-star: daily review_queue_opened over the last 30 days ---
  const rqoEvents = await prisma.event.findMany({
    where: { name: "review_queue_opened", occurredAt: { gte: since30 } },
    select: { occurredAt: true },
  });

  // Bucket into 30 daily counts (oldest → newest).
  const dayKeys: string[] = [];
  for (let i = 29; i >= 0; i--) {
    dayKeys.push(format(subDays(now, i), "yyyy-MM-dd"));
  }
  const rqoCountByDay = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  for (const e of rqoEvents) {
    const k = format(e.occurredAt, "yyyy-MM-dd");
    if (rqoCountByDay.has(k)) rqoCountByDay.set(k, (rqoCountByDay.get(k) ?? 0) + 1);
  }
  const rqoSeries = dayKeys.map((k) => rqoCountByDay.get(k) ?? 0);
  const rqoTotal30 = rqoSeries.reduce((a, b) => a + b, 0);
  const rqoToday = rqoCountByDay.get(dayKeys[dayKeys.length - 1]) ?? 0;

  // --- Global triage_summary_stats aggregation (last 30 days, ALL users) ---
  const statAgg = await prisma.triageSummaryStat.aggregate({
    where: { statDate: { gte: since30 } },
    _sum: {
      totalEmails: true,
      importantCount: true,
      fyiCount: true,
      newsletterCount: true,
      marketingCount: true,
      receiptCount: true,
      automatedNotificationCount: true,
      queueClearedCount: true,
      ruleOverriddenCount: true,
    },
  });
  const sums = statAgg._sum;
  const categoryTotals: CategoryTotals = {
    importantCount: sums.importantCount ?? 0,
    fyiCount: sums.fyiCount ?? 0,
    newsletterCount: sums.newsletterCount ?? 0,
    marketingCount: sums.marketingCount ?? 0,
    receiptCount: sums.receiptCount ?? 0,
    automatedNotificationCount: sums.automatedNotificationCount ?? 0,
  };
  const totalTriaged = sums.totalEmails ?? 0;
  const totalCleared = sums.queueClearedCount ?? 0;
  const totalImportant = sums.importantCount ?? 0;
  const totalOverridden = sums.ruleOverriddenCount ?? 0;

  // --- Key event counts by name over last 7 / 30 days ---
  const grouped30 = await prisma.event.groupBy({
    by: ["name"],
    where: { name: { in: KEY_EVENTS.map((e) => e.name) }, occurredAt: { gte: since30 } },
    _count: { _all: true },
  });
  const grouped7 = await prisma.event.groupBy({
    by: ["name"],
    where: { name: { in: KEY_EVENTS.map((e) => e.name) }, occurredAt: { gte: since7 } },
    _count: { _all: true },
  });
  const count30 = new Map(grouped30.map((g) => [g.name, g._count._all]));
  const count7 = new Map(grouped7.map((g) => [g.name, g._count._all]));

  // --- Admin's OWN 30-day daily stats for CSV export ---
  const ownStats = await prisma.triageSummaryStat.findMany({
    where: { userAccountId: user.id, statDate: { gte: since30 } },
    orderBy: { statDate: "asc" },
  });
  const exportStats: ExportStat[] = ownStats.map((s) => ({
    statDate: format(s.statDate, "yyyy-MM-dd"),
    totalEmails: s.totalEmails,
    importantCount: s.importantCount,
    fyiCount: s.fyiCount,
    newsletterCount: s.newsletterCount,
    marketingCount: s.marketingCount,
    receiptCount: s.receiptCount,
    automatedNotificationCount: s.automatedNotificationCount,
    flaggedLowConfidenceCount: s.flaggedLowConfidenceCount,
    queueClearedCount: s.queueClearedCount,
    ruleOverriddenCount: s.ruleOverriddenCount,
  }));

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Admin metrics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              First-party event analytics, aggregated across all accounts. Last 30 days.
            </p>
          </div>
          <ExportButton stats={exportStats} />
        </header>

        {/* North-star headline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Review queue opens</CardTitle>
            <p className="text-sm text-muted-foreground">
              North-star metric — chose Triage Mail over a raw inbox.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="font-display text-4xl font-extrabold tabular-nums">{rqoTotal30.toLocaleString()}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  opens in 30 days · <span className="font-medium text-foreground">{rqoToday}</span> today
                </p>
              </div>
              <Sparkline
                values={rqoSeries}
                width={280}
                height={56}
                ariaLabel={`Review queue opens per day over the last 30 days, ${rqoTotal30} total`}
                className="max-w-full"
              />
            </div>
          </CardContent>
        </Card>

        {/* Rate cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <RateCard
            label="Queue clearance rate"
            value={pct(totalCleared, totalImportant)}
            sub={`${totalCleared.toLocaleString()} cleared / ${totalImportant.toLocaleString()} important`}
          />
          <RateCard
            label="Rule override ratio"
            value={pct(totalOverridden, totalTriaged)}
            sub={`${totalOverridden.toLocaleString()} rule-routed / ${totalTriaged.toLocaleString()} triaged`}
          />
          <RateCard
            label="Total triaged"
            value={totalTriaged.toLocaleString()}
            sub="across all accounts"
          />
        </div>

        {/* Throughput by category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Triage throughput by category</CardTitle>
            <p className="text-sm text-muted-foreground">Summed over all accounts, last 30 days.</p>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-2 font-medium">Category</th>
                  <th className="px-6 py-2 text-right font-medium">Count</th>
                  <th className="px-6 py-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_ROWS.map((row) => {
                  const v = categoryTotals[row.key];
                  return (
                    <tr key={row.key} className="border-b border-border last:border-0">
                      <td className="px-6 py-2.5">{row.label}</td>
                      <td className="px-6 py-2.5 text-right tabular-nums">{v.toLocaleString()}</td>
                      <td className="px-6 py-2.5 text-right tabular-nums text-muted-foreground">
                        {pct(v, totalTriaged)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Key event counts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Key event counts</CardTitle>
            <p className="text-sm text-muted-foreground">Event volume over the last 7 and 30 days.</p>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-2 font-medium">Event</th>
                  <th className="px-6 py-2 text-right font-medium">7d</th>
                  <th className="px-6 py-2 text-right font-medium">30d</th>
                </tr>
              </thead>
              <tbody>
                {KEY_EVENTS.map((e) => (
                  <tr key={e.name} className="border-b border-border last:border-0">
                    <td className="px-6 py-2.5">
                      {e.label}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{e.name}</span>
                    </td>
                    <td className="px-6 py-2.5 text-right tabular-nums">
                      {(count7.get(e.name) ?? 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-2.5 text-right tabular-nums text-muted-foreground">
                      {(count30.get(e.name) ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RateCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
