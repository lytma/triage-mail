import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Inbox, LayoutGrid, BarChart3, ShieldCheck } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { EnterDemoButton } from "@/components/demo/enter-demo-button";
import { buildCanonicalUrl, getRequestOrigin } from "@/server/lib/request-url";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = await buildCanonicalUrl("/demo");
  const title = "Try Triage Mail — explore a seeded demo inbox";
  const description =
    "Explore a fully seeded Triage Mail inbox — 200+ AI-triaged sample emails, a prioritized Review queue, category folders, and stats. No signup required.";
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      images: ["/og/og-default.png"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og/og-default.png"],
    },
  };
}

interface DemoPreviewItem {
  id: string;
  senderName: string | null;
  senderEmail: string;
  subject: string | null;
  triageReason: string | null;
  triageConfidence: number | null;
}

interface DemoResponse {
  demoAccount: { id: string; displayName: string };
  reviewQueue: DemoPreviewItem[];
  categoryFolders: { id: string; name: string; slug: string }[];
}

/** Static illustrative rows used if the live demo read is unavailable. */
const FALLBACK_ITEMS: DemoPreviewItem[] = [
  {
    id: "s1",
    senderName: "Sarah Chen",
    senderEmail: "sarah@acme.co",
    subject: "Contract redlines for review",
    triageReason: "Known client; likely needs a reply before the deadline.",
    triageConfidence: 0.94,
  },
  {
    id: "s2",
    senderName: "DevOps Alerts",
    senderEmail: "alerts@status.io",
    subject: "Deployment failed in production",
    triageReason: "Operational alert affecting a live service.",
    triageConfidence: 0.88,
  },
  {
    id: "s3",
    senderName: "Priya Nair",
    senderEmail: "priya@vendor.com",
    subject: "Quick question about the invoice",
    triageReason: "Ambiguous intent — flagged for your review.",
    triageConfidence: 0.62,
  },
];

const FALLBACK_FOLDERS = [
  { id: "f1", name: "Newsletters", slug: "newsletters" },
  { id: "f2", name: "Marketing", slug: "marketing" },
  { id: "f3", name: "Receipts", slug: "receipts" },
  { id: "f4", name: "FYI", slug: "fyi" },
  { id: "f5", name: "Automated", slug: "automated_notifications" },
];

async function loadDemoPreview(): Promise<{ items: DemoPreviewItem[]; folders: { id: string; name: string; slug: string }[] }> {
  try {
    const origin = await getRequestOrigin();
    const res = await fetch(`${origin}/api/demo/demo`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as DemoResponse;
    const items = (data.reviewQueue ?? []).slice(0, 4);
    return {
      items: items.length ? items : FALLBACK_ITEMS,
      folders: data.categoryFolders?.length ? data.categoryFolders : FALLBACK_FOLDERS,
    };
  } catch {
    return { items: FALLBACK_ITEMS, folders: FALLBACK_FOLDERS };
  }
}

const HIGHLIGHTS = [
  { icon: Inbox, title: "Prioritized Review queue", desc: "15 important items ordered by importance, each with an AI reason and confidence badge." },
  { icon: LayoutGrid, title: "Category folders", desc: "Marketing, Newsletters, Receipts, FYI, and Automated — bulk-clear the noise in a pass." },
  { icon: BarChart3, title: "Triage summary stats", desc: "30 days of realistic trend data — volume by category and queue clearance rate." },
  { icon: ShieldCheck, title: "Metadata only", desc: "The demo mirrors the real product — sender, subject, and triage metadata only, never bodies." },
];

function confidenceTone(c: number | null): { dot: string; label: string } {
  if (c === null) return { dot: "bg-border", label: "—" };
  if (c >= 0.85) return { dot: "bg-primary", label: "High" };
  if (c >= 0.7) return { dot: "bg-primary/60", label: "Medium" };
  return { dot: "bg-accent", label: "Flagged" };
}

export default async function DemoPage() {
  const { items, folders } = await loadDemoPreview();

  return (
    <div>
      <SiteHeader />

      {/* Hero */}
      <section className="pt-14">
        <div className="mk-wrap">
          <div className="mx-auto max-w-[760px] text-center">
            <span className="mk-eyebrow">Demo account</span>
            <h1 className="mk-hero-title">Explore Triage Mail with a seeded inbox.</h1>
            <p className="mx-auto mb-8 max-w-[640px] text-lg text-muted-foreground">
              Explore a fully seeded inbox — 200+ sample emails triaged by AI, a prioritized
              Review queue, category folders, and stats. No signup.
            </p>
            <div className="flex flex-col items-center gap-3">
              <EnterDemoButton />
              <p className="text-sm text-muted-foreground">
                Demo actions are simulated — no real email is sent.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What's inside — live preview */}
      <section className="py-14">
        <div className="mk-wrap">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
            {/* Preview card */}
            <div className="rounded-card border border-border bg-card p-6 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">A peek at the Review queue</h2>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                  Live sample
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {items.map((it) => {
                  const tone = confidenceTone(it.triageConfidence);
                  return (
                    <li
                      key={it.id}
                      className="flex items-start gap-3 rounded-md border border-border bg-background px-4 py-3"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">
                            {it.senderName ?? it.senderEmail}
                          </span>
                          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            {tone.label}
                          </span>
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {it.subject ?? "(no subject)"}
                        </div>
                        {it.triageReason && (
                          <div className="mt-1 truncate text-xs text-muted-foreground/80">
                            {it.triageReason}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {folders.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Category folders
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {folders.map((f) => (
                      <span
                        key={f.id}
                        className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Highlights */}
            <div>
              <span className="mk-eyebrow">What&apos;s inside</span>
              <h2 className="mk-section-title">Everything the real product does — pre-seeded.</h2>
              <ul className="mt-6 space-y-5">
                {HIGHLIGHTS.map((h) => (
                  <li key={h.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                      <h.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-display font-bold">{h.title}</h3>
                      <p className="text-sm text-muted-foreground">{h.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <EnterDemoButton />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="mk-wrap text-center">
          <div className="mx-auto max-w-[680px]">
            <h2 className="mb-3 font-display text-4xl font-extrabold tracking-tight">
              Ready to triage your own inbox?
            </h2>
            <p className="mb-8 text-lg opacity-90">
              Start the demo now, then connect a real Gmail or Outlook mailbox when you&apos;re ready.
            </p>
            <div className="flex flex-col items-center gap-4">
              <ul className="mb-2 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm opacity-90">
                {["No signup", "No credit card", "Simulated actions only"].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    {t}
                  </li>
                ))}
              </ul>
              <EnterDemoButton
                className="inline-flex items-center justify-center gap-2 rounded-btn bg-background px-6 py-3 text-base font-semibold text-primary transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary disabled:cursor-not-allowed disabled:opacity-70"
              />
              <Link
                href="/pricing"
                className="text-sm font-semibold text-primary-foreground/90 underline-offset-4 hover:underline"
              >
                Or see pricing plans
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
