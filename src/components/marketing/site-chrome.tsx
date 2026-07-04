import Link from "next/link";
import { Brand } from "@/components/brand";

/** Marketing site header — mirrors the DESIGN_SPEC chosen mockup nav. */
export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-50 border-b border-border"
      style={{
        background: "color-mix(in srgb, var(--color-bg) 100%, transparent)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="mk-wrap flex items-center justify-between gap-6 py-4">
        <Brand />
        <nav className="flex items-center gap-4 md:gap-6">
          <Link href="/#how" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block">
            How it works
          </Link>
          <Link href="/#features" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block">
            Features
          </Link>
          <Link href="/demo" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Demo
          </Link>
          <Link href="/signin" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            href="/signin"
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Get started — free
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Marketing site footer — mirrors the DESIGN_SPEC chosen mockup footer. */
export function SiteFooter() {
  return (
    <footer>
      <div className="mk-wrap">
        <div className="grid grid-cols-2 gap-8 border-t border-border py-12 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Brand />
            <p className="mt-3 max-w-[280px] text-sm text-muted-foreground">
              A web-based email client that unifies multiple inboxes and uses a
              hosted LLM to triage every incoming email.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              ["Review queue", "/signin"],
              ["Category folders", "/signin"],
              ["Triage rules", "/signin"],
              ["Summary stats", "/signin"],
            ]}
          />
          <FooterCol
            title="Integrations"
            links={[
              ["Gmail sync", "/#features"],
              ["Outlook sync", "/#features"],
              ["Push notifications", "/#features"],
              ["Demo account", "/demo"],
            ]}
          />
          <FooterCol
            title="Account"
            links={[
              ["Sign in", "/signin"],
              ["Get started — free", "/signin"],
              ["Demo", "/demo"],
            ]}
          />
        </div>
        <div className="flex flex-wrap justify-between gap-4 border-t border-border py-6 text-sm text-muted-foreground">
          <span>© Triage Mail. Metadata-only storage. Two-way sync with Gmail, Outlook &amp; IMAP.</span>
          <span>Free — no subscription</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-foreground">{title}</h4>
      {links.map(([label, href]) => (
        <Link key={label} href={href} className="mb-2.5 block text-sm text-muted-foreground hover:text-foreground">
          {label}
        </Link>
      ))}
    </div>
  );
}
