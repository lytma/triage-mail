"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, subDays } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PRIMARY = "#2563EB";
const ACCENT = "#F59E0B";
const NEUTRAL = "#94A3B8";
const GRID = "#E2E8F0";
const MUTED_FG = "#475569";

type CategoryKey =
  | "important"
  | "fyi"
  | "newsletter"
  | "marketing"
  | "receipt"
  | "automated_notification";

interface DailyStat {
  statDate: string;
  totalEmails: number;
  importantCount: number;
  fyiCount: number;
  newsletterCount: number;
  marketingCount: number;
  receiptCount: number;
  automatedNotificationCount: number;
  flaggedLowConfidenceCount: number;
  queueClearedCount: number;
  ruleOverriddenCount: number;
}

interface StatsSummary {
  totalEmails: number;
  avgPerDay: number;
  avgQueueClearanceRate: number; // 0-1
  lowConfidenceRate: number; // 0-1
  ruleVsAi: { rule: number; ai: number };
  categoryTotals: Record<CategoryKey, number>;
  topCategory: string | null;
  topSenders: { senderEmail: string; count: number }[];
}

interface StatsResponse {
  dailyStats: DailyStat[];
  summary: StatsSummary;
}

/** Category display config, in the order the PRD lists them, with folder routes. */
const CATEGORY_META: { key: CategoryKey; label: string; route: string }[] = [
  { key: "important", label: "Important", route: "/review" },
  { key: "fyi", label: "FYI", route: "/folders/fyi" },
  { key: "newsletter", label: "Newsletters", route: "/folders/newsletters" },
  { key: "marketing", label: "Marketing", route: "/folders/marketing" },
  { key: "receipt", label: "Receipts", route: "/folders/receipts" },
  { key: "automated_notification", label: "Automated", route: "/folders/automated_notifications" },
];

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function StatsDashboard() {
  const router = useRouter();
  const [rangeDays, setRangeDays] = useState(30);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    const endDate = format(new Date(), "yyyy-MM-dd");
    const startDate = format(subDays(new Date(), days - 1), "yyyy-MM-dd");
    try {
      const res = await fetch(`/api/triage-stats?startDate=${startDate}&endDate=${endDate}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = (await res.json()) as StatsResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(rangeDays);
  }, [rangeDays, load]);

  const summary = data?.summary;

  const categoryChartData = useMemo(() => {
    if (!summary) return [];
    return CATEGORY_META.map((c) => ({
      key: c.key,
      label: c.label,
      route: c.route,
      value: summary.categoryTotals?.[c.key] ?? 0,
    }));
  }, [summary]);

  const trendData = useMemo(() => {
    if (!data) return [];
    return data.dailyStats.map((d) => ({
      date: format(new Date(d.statDate), "MMM d"),
      received: d.totalEmails,
      cleared: d.queueClearedCount,
    }));
  }, [data]);

  const ruleVsAiData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "AI", value: summary.ruleVsAi?.ai ?? 0, color: PRIMARY },
      { name: "Rules", value: summary.ruleVsAi?.rule ?? 0, color: ACCENT },
    ];
  }, [summary]);

  const hasAnyData = Boolean(summary && summary.totalEmails > 0);

  return (
    <div className="space-y-6">
      {/* Range selector — segmented control */}
      <div
        role="tablist"
        aria-label="Date range"
        className="inline-flex rounded-btn border border-border bg-muted p-1"
      >
        {RANGES.map((r) => {
          const active = r.days === rangeDays;
          return (
            <button
              key={r.days}
              role="tab"
              aria-selected={active}
              onClick={() => setRangeDays(r.days)}
              className={`rounded-[calc(var(--radius-btn)-0.25rem)] px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {error && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load stats: {error}
          </CardContent>
        </Card>
      )}

      {loading && <LoadingState />}

      {!loading && !error && summary && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Emails triaged" value={summary.totalEmails.toLocaleString()} />
            <StatCard label="Avg per day" value={Math.round(summary.avgPerDay).toLocaleString()} />
            <StatCard label="Queue clearance rate" value={pct(summary.avgQueueClearanceRate)} />
            <StatCard label="Low-confidence rate" value={pct(summary.lowConfidenceRate)} />
          </div>

          {!hasAnyData && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm font-medium">No triage data for this range yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Once mail is triaged, your category breakdown and trends will appear here.
                </p>
              </CardContent>
            </Card>
          )}

          {hasAnyData && (
            <>
              {/* Category breakdown + Rules vs AI */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Category breakdown</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Click a bar to open that category folder.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={categoryChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={GRID} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 12, fill: MUTED_FG }}
                          tickLine={false}
                          axisLine={{ stroke: GRID }}
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: MUTED_FG }}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(37,99,235,0.06)" }}
                          contentStyle={tooltipStyle}
                          formatter={(v) => [Number(v).toLocaleString(), "Emails"]}
                        />
                        <Bar
                          dataKey="value"
                          radius={[4, 4, 0, 0]}
                          cursor="pointer"
                          onClick={(d: { route?: string; payload?: { route?: string } }) => {
                            const route = d?.payload?.route ?? d?.route;
                            if (route) router.push(route);
                          }}
                        >
                          {categoryChartData.map((c) => (
                            <Cell
                              key={c.key}
                              fill={c.key === "important" ? PRIMARY : NEUTRAL}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rules vs. AI</CardTitle>
                    <p className="text-sm text-muted-foreground">Who routed your mail.</p>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={ruleVsAiData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {ruleVsAiData.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(v, n) => [Number(v).toLocaleString(), n]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex items-center justify-center gap-4 text-sm">
                      <LegendDot color={PRIMARY} label={`AI (${summary.ruleVsAi?.ai ?? 0})`} />
                      <LegendDot color={ACCENT} label={`Rules (${summary.ruleVsAi?.rule ?? 0})`} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Daily trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Daily trend</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Emails received vs. Review queue items cleared.
                  </p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={GRID} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: MUTED_FG }}
                        tickLine={false}
                        axisLine={{ stroke: GRID }}
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: MUTED_FG }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="received"
                        name="Received"
                        stroke={PRIMARY}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="cleared"
                        name="Cleared"
                        stroke={ACCENT}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-2 flex items-center justify-center gap-4 text-sm">
                    <LegendDot color={PRIMARY} label="Received" />
                    <LegendDot color={ACCENT} label="Cleared" />
                  </div>
                </CardContent>
              </Card>

              {/* Top senders */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top senders</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Highest-volume senders in this range.
                  </p>
                </CardHeader>
                <CardContent>
                  {summary.topSenders && summary.topSenders.length > 0 ? (
                    <ol className="divide-y divide-border">
                      {summary.topSenders.slice(0, 10).map((s, i) => (
                        <li
                          key={s.senderEmail}
                          className="flex items-center gap-3 py-2.5 text-sm"
                        >
                          <span className="w-5 shrink-0 text-right font-medium tabular-nums text-muted-foreground">
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{s.senderEmail}</span>
                          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                            {s.count.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground">No senders in this range.</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  borderRadius: "0.5rem",
  border: "1px solid #E2E8F0",
  fontSize: "12px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-[344px] rounded-card lg:col-span-2" />
        <Skeleton className="h-[344px] rounded-card" />
      </div>
      <Skeleton className="h-[364px] rounded-card" />
    </div>
  );
}
