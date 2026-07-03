import { StatsDashboard } from "@/components/stats/stats-dashboard";

export const dynamic = "force-dynamic";

export default function StatsPage() {
  // Auth redirect is handled by the (app) layout; this is a thin server shell
  // that renders the client dashboard which fetches /api/triage-stats.
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight">Triage summary stats</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How your mail was triaged over time — volume by category, daily trends, and how quickly you clear your Review queue.
          </p>
        </header>
        <StatsDashboard />
      </div>
    </div>
  );
}
