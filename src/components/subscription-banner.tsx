"use client";

import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";

/**
 * In-app banners for trial-expiring-soon and payment-failed states
 * (PRD notifications table). Rendered above the reconnect banner.
 */
export function SubscriptionBanner({
  status,
  trialEndsAt,
}: {
  status: string;
  trialEndsAt: string | null;
}) {
  if (status === "past_due") {
    return (
      <Bar tone="destructive">
        Your subscription payment failed. Update your payment method to avoid
        service interruption.{" "}
        <Link href="/settings#subscription" className="font-semibold underline">
          Manage billing
        </Link>
      </Bar>
    );
  }

  if ((status === "canceled" || status === "expired")) {
    return (
      <Bar tone="destructive">
        Your subscription has lapsed — sync and triage are paused. Read-only
        access continues for 30 days.{" "}
        <Link href="/settings#subscription" className="font-semibold underline">
          Renew
        </Link>
      </Bar>
    );
  }

  if (status === "trialing" && trialEndsAt) {
    const days = differenceInCalendarDays(new Date(trialEndsAt), new Date());
    if (days <= 3 && days >= 0) {
      return (
        <Bar tone="warning">
          Your free trial ends in {days === 0 ? "less than a day" : `${days} day${days === 1 ? "" : "s"}`}.
          Subscribe to keep your mailboxes connected.{" "}
          <Link href="/settings#subscription" className="font-semibold underline">
            Subscribe
          </Link>
        </Bar>
      );
    }
  }

  return null;
}

function Bar({
  tone,
  children,
}: {
  tone: "warning" | "destructive";
  children: React.ReactNode;
}) {
  const cls =
    tone === "destructive"
      ? "border-destructive bg-destructive/10 text-destructive-foreground"
      : "border-warning bg-warning/10";
  return (
    <div className={`border-b px-4 py-2.5 text-sm ${cls}`} role="status">
      <span className={tone === "destructive" ? "text-destructive" : ""}>{children}</span>
    </div>
  );
}
