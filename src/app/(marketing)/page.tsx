import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  CheckCheck,
  ListChecks,
  Mails,
  Sparkles,
  LayoutGrid,
  BellRing,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { buildCanonicalUrl } from "@/server/lib/request-url";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = await buildCanonicalUrl("/");
  const title = "Triage Mail — AI email triage that surfaces only what matters";
  const description =
    "Triage Mail unifies your Gmail and Outlook inboxes and uses AI to surface only important mail in a prioritized Review queue. Plain-English rules always override the AI.";
  return {
    title,
    description,
    alternates: { canonical },
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

const FEATURES = [
  { icon: CheckCheck, title: "Review queue, ordered", desc: "Every important email lands in a single queue sorted by importance first, then recency. Reply, forward, or compose right from the queue." },
  { icon: ListChecks, title: "Plain-English rules", desc: "Write rules like “Always file receipts to Finance.” Your rules always override the AI — no fighting the model for control of your inbox." },
  { icon: Mails, title: "Two-way sync", desc: "Archive, move, send, and delete actions sync back to Gmail and Outlook. Your original mailbox stays perfectly in step." },
  { icon: Sparkles, title: "AI triage per email", desc: "A hosted LLM classifies every incoming message. Low-confidence items are filed into the best-guess category but flagged for your review." },
  { icon: LayoutGrid, title: "Category folders", desc: "Marketing, Newsletters, and more — bulk-select and archive entire categories in one pass so the noise disappears fast." },
  { icon: BellRing, title: "Important-only push", desc: "Notifications fire only when an important email lands in your Review queue. Everything else waits quietly until you open the app." },
];

export default function LandingPage() {
  return (
    <div>
      <SiteHeader />

      {/* Hero */}
      <section className="pt-14">
        <div className="mk-wrap">
          <div
            className="mb-6 flex items-center gap-3 rounded-md border px-5 py-3 text-sm"
            style={{ borderColor: "var(--color-accent)", background: "color-mix(in srgb, var(--color-accent) 12%, var(--color-bg))" }}
          >
            <span className="font-bold text-accent">!</span>
            <span>
              <strong>Reconnect banner —</strong> when a connected account loses
              access, Triage Mail prompts you to re-authenticate so sync resumes.
            </span>
          </div>
          <div className="mx-auto max-w-[760px] text-center">
            <span className="mk-eyebrow">AI email triage</span>
            <h1 className="mk-hero-title">Only review what actually matters.</h1>
            <p className="mx-auto mb-8 max-w-[640px] text-lg text-muted-foreground">
              Triage Mail unifies your Gmail, Outlook, and IMAP (iCloud, Yahoo,
              Fastmail) inboxes and uses a hosted LLM to classify every incoming
              email — routing the important ones to a Review queue and the rest
              into category folders. Plain-English rules always override the AI.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/signin" className="rounded-btn bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Get started — free
              </Link>
              <Link href="/demo" className="rounded-btn border border-border bg-background px-5 py-3 text-sm font-semibold hover:bg-muted">
                View demo account
              </Link>
            </div>
          </div>
          <div className="mt-12 overflow-hidden rounded-card border border-border shadow-card">
            <Image src="/brand/hero.jpg" alt="Triage Mail review queue interface" width={2752} height={1536} className="h-auto w-full" priority />
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="py-8">
        <div className="mk-wrap">
          <div className="grid grid-cols-2 gap-6 rounded-card bg-muted p-10 text-center md:grid-cols-4">
            <Stat num="100%" label="of incoming mail processed — no throttling" />
            <Stat num="0" label="email bodies stored — metadata only" />
            <Stat num="2-way" label="sync with Gmail & Outlook" />
            <Stat num="1st" label="importance, then recency — always ordered" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16">
        <div className="mk-wrap">
          <div className="mx-auto mb-12 max-w-[640px] text-center">
            <span className="mk-eyebrow">Features</span>
            <h2 className="mk-section-title">A calm power tool for high-volume inboxes</h2>
            <p className="text-muted-foreground">
              Everything is designed to keep you scanning, deciding, and clearing — never drowning in volume.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-card border border-border bg-card p-6 shadow-card">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-muted text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 font-display text-lg font-bold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-muted py-16">
        <div className="mk-wrap">
          <div className="mx-auto mb-10 max-w-[640px] text-center">
            <span className="mk-eyebrow">How it works</span>
            <h2 className="mk-section-title">From chaos to cleared in four moves</h2>
          </div>
          <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
            <div>
              <div className="font-display text-sm font-bold uppercase tracking-wide text-primary">Step 01 — Connect</div>
              <h3 className="my-3 font-display text-2xl font-bold">Link Gmail &amp; Outlook</h3>
              <p className="mb-5 text-muted-foreground">
                Connect your accounts once. Triage Mail two-way syncs every archive, move, send, and delete back to the original mailbox — nothing lives in a silo.
              </p>
              <ul className="space-y-3">
                {["Metadata-only storage — no email bodies ever stored", "Unified Review queue across all connected accounts", "Reconnect banner appears instantly if access drops"].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-card border border-border bg-muted p-6">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Review queue</div>
              <div className="flex flex-col gap-2">
                <MockRow dot="important" from="Sarah Chen" subj="Contract redlines for review" cat="Important" />
                <MockRow dot="important" from="DevOps Alerts" subj="Deployment failed in production" cat="Important" />
                <MockRow dot="flagged" from="Confused sender" subj="Quick question about the invoice" cat="Flagged" />
                <MockRow dot="" from="Newsletter" subj="This week in design" cat="Newsletter" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-16">
        <div className="mk-wrap">
          <div className="mx-auto max-w-[820px] rounded-card bg-muted p-12 text-center">
            <p className="mb-6 font-display text-2xl font-semibold leading-snug">
              “I get hundreds of emails a day across two inboxes. Triage Mail means
              I open the Review queue, handle what matters, bulk-archive the rest,
              and I’m done. It’s the first inbox that feels calm under volume.”
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary font-display font-bold text-primary-foreground">MK</div>
              <div className="text-left">
                <div className="text-sm font-semibold">Maya Kapoor</div>
                <div className="text-sm text-muted-foreground">Product Lead, knowledge worker</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="mk-wrap text-center">
          <div className="mx-auto max-w-[680px]">
            <h2 className="mb-3 font-display text-4xl font-extrabold tracking-tight">Stop reviewing what doesn&apos;t matter.</h2>
            <p className="mb-8 text-lg opacity-90">
              It&apos;s completely free — no subscription, no credit card. Try the demo account with seeded sample emails first — no setup required.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/signin" className="rounded-btn bg-background px-5 py-3 text-sm font-semibold text-primary hover:opacity-90">
                Get started — free
              </Link>
              <Link href="/demo" className="rounded-btn border border-primary-foreground/40 px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-foreground/10">
                Explore demo account
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Stat({ num, label }: { num: string; label: string }) {
  return (
    <div>
      <div className="font-display text-4xl font-extrabold leading-none text-primary">{num}</div>
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function MockRow({ dot, from, subj, cat }: { dot: string; from: string; subj: string; cat: string }) {
  const dotColor = dot === "important" ? "bg-primary" : dot === "flagged" ? "bg-accent" : "bg-border";
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{from}</div>
        <div className="truncate text-xs text-muted-foreground">{subj}</div>
      </div>
      <span className="ml-auto rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{cat}</span>
    </div>
  );
}
