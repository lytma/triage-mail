"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Inbox,
  Newspaper,
  Megaphone,
  Receipt,
  Info,
  Bell,
  PenSquare,
  BarChart3,
  Settings,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";

export interface SidebarFolder {
  slug: string;
  name: string;
  itemCount: number;
}

const FOLDER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  fyi: Info,
  newsletters: Newspaper,
  marketing: Megaphone,
  receipts: Receipt,
  automated_notifications: Bell,
};

export function AppSidebar({
  folders,
  reviewCount,
  isAdmin,
  userEmail,
}: {
  folders: SidebarFolder[];
  reviewCount: number;
  isAdmin: boolean;
  userEmail: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const NavLink = ({
    href,
    icon: Icon,
    label,
    badge,
  }: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    badge?: number;
  }) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {badge != null && badge > 0 && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              active ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground",
            )}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  const content = (
    <div className="flex h-full flex-col gap-1 p-4">
      <div className="mb-4 px-1">
        <Brand />
      </div>

      <Link
        href="/compose"
        onClick={() => setOpen(false)}
        className="mb-3 flex items-center justify-center gap-2 rounded-btn bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        <PenSquare className="h-4 w-4" /> Compose
      </Link>

      <NavLink href="/review" icon={Inbox} label="Review queue" badge={reviewCount} />

      <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Categories
      </div>
      {folders.map((f) => (
        <NavLink
          key={f.slug}
          href={`/folders/${f.slug}`}
          icon={FOLDER_ICONS[f.slug] ?? Info}
          label={f.name}
          badge={f.itemCount}
        />
      ))}

      <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Insights
      </div>
      <NavLink href="/stats" icon={BarChart3} label="Triage stats" />
      {isAdmin && <NavLink href="/admin" icon={ShieldCheck} label="Admin metrics" />}
      <NavLink href="/settings" icon={Settings} label="Settings" />

      <div className="mt-auto truncate px-3 pt-4 text-xs text-muted-foreground" title={userEmail}>
        {userEmail}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <Brand />
        <button
          aria-label="Open navigation"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 hover:bg-muted"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:block">
        {content}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-card">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
