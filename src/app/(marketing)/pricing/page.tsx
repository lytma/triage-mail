import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { buildCanonicalUrl } from "@/server/lib/request-url";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = await buildCanonicalUrl("/pricing");
  const title = "Triage Mail Pricing — monthly & yearly plans";
  const description =
    "Triage Mail is $12/month or $108/year (two months free). Start with a 14-day free trial — no credit card required.";
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: "website", url: canonical, images: ["/og/og-default.png"] },
    twitter: { card: "summary_large_image", title, description, images: ["/og/og-default.png"] },
  };
}

const INCLUDED = [
  "Unlimited Gmail & Outlook mailboxes",
  "AI triage on every incoming email",
  "Prioritized Review queue",
  "Plain-English rules that override the AI",
  "Category folders with bulk-archive",
  "Two-way sync (archive, send, reply, forward)",
  "Important-only web push notifications",
  "Triage summary stats",
];

export default function PricingPage() {
  return (
    <div>
      <SiteHeader />
      <section className="py-16">
        <div className="mk-wrap">
          <div className="mx-auto mb-12 max-w-[640px] text-center">
            <span className="mk-eyebrow">Pricing</span>
            <h1 className="mk-section-title">One simple plan. Two ways to pay.</h1>
            <p className="text-muted-foreground">
              Start free for 14 days — no credit card required. The subscription
              covers all AI triage costs; you&apos;re never metered per email.
            </p>
          </div>

          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
            <PlanCard plan="monthly" title="Monthly" price="$12" cadence="per month" note="Billed monthly. Cancel anytime." />
            <PlanCard plan="yearly" title="Yearly" price="$108" cadence="per year" note="Two months free vs. monthly." featured />
          </div>

          <div className="mx-auto mt-10 max-w-3xl rounded-card border border-border bg-card p-8 shadow-card">
            <h2 className="mb-4 font-display text-lg font-bold">Every plan includes</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {INCLUDED.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

function PlanCard({
  plan,
  title,
  price,
  cadence,
  note,
  featured,
}: {
  plan: "monthly" | "yearly";
  title: string;
  price: string;
  cadence: string;
  note: string;
  featured?: boolean;
}) {
  return (
    <div className={`rounded-card border bg-card p-8 shadow-card ${featured ? "border-primary ring-1 ring-primary" : "border-border"}`}>
      {featured && (
        <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Best value
        </span>
      )}
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <div className="mt-3 flex items-end gap-2">
        <span className="font-display text-4xl font-extrabold">{price}</span>
        <span className="pb-1 text-sm text-muted-foreground">{cadence}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{note}</p>
      <Link
        href={`/signin?plan=${plan}`}
        className="mt-6 block rounded-btn bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Start 14-day free trial
      </Link>
    </div>
  );
}
