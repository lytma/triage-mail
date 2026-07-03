"use client";

import { Download } from "lucide-react";

export interface ExportStat {
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

const COLUMNS: { key: keyof ExportStat; header: string }[] = [
  { key: "statDate", header: "date" },
  { key: "totalEmails", header: "total_emails" },
  { key: "importantCount", header: "important" },
  { key: "fyiCount", header: "fyi" },
  { key: "newsletterCount", header: "newsletter" },
  { key: "marketingCount", header: "marketing" },
  { key: "receiptCount", header: "receipt" },
  { key: "automatedNotificationCount", header: "automated_notification" },
  { key: "flaggedLowConfidenceCount", header: "flagged_low_confidence" },
  { key: "queueClearedCount", header: "queue_cleared" },
  { key: "ruleOverriddenCount", header: "rule_overridden" },
];

function toCsv(stats: ExportStat[]): string {
  const head = COLUMNS.map((c) => c.header).join(",");
  const rows = stats.map((s) =>
    COLUMNS.map((c) => {
      const v = s[c.key];
      // Only statDate is a string; wrap defensively in quotes if it contains a comma.
      return typeof v === "string" && v.includes(",") ? `"${v}"` : String(v);
    }).join(","),
  );
  return [head, ...rows].join("\n");
}

/** Client-side CSV export of the admin's own daily triage summary stats. */
export function ExportButton({ stats }: { stats: ExportStat[] }) {
  const handleExport = () => {
    const csv = toCsv(stats);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `triage-summary-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={stats.length === 0}
      className="inline-flex items-center gap-2 rounded-btn border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download className="h-4 w-4" />
      Export CSV
    </button>
  );
}
