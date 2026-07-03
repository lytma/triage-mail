import * as React from "react";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Provider = "gmail" | "outlook";

/** Small colored provider indicator: Gmail = red-ish, Outlook = blue-ish. */
export function ProviderIndicator({
  provider,
  mailboxEmail,
  className,
}: {
  provider: Provider;
  mailboxEmail?: string;
  className?: string;
}) {
  const isGmail = provider === "gmail";
  const label = isGmail ? "Gmail" : "Outlook";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
      title={mailboxEmail ? `${label} · ${mailboxEmail}` : label}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-md",
          isGmail ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
        )}
      >
        <Mail className="h-3 w-3" />
      </span>
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}

/**
 * Confidence badge, color-coded per spec:
 * green ≥0.85 (success), yellow 0.70–0.84 (warning), red <0.70 (destructive).
 * All variants use accessible fg colors (WCAG AA) from the theme.
 */
export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence == null) {
    return (
      <Badge variant="secondary" className="tabular-nums">
        No score
      </Badge>
    );
  }
  const pct = Math.round(confidence * 100);
  let variant: "success" | "warning" | "destructive" = "destructive";
  let label = "Low";
  if (confidence >= 0.85) {
    variant = "success";
    label = "High";
  } else if (confidence >= 0.7) {
    variant = "warning";
    label = "Medium";
  }
  return (
    <Badge variant={variant} className="tabular-nums" title={`AI confidence ${pct}%`}>
      {label} · {pct}%
    </Badge>
  );
}

export function confidenceIsLow(confidence: number | null): boolean {
  return confidence != null && confidence < 0.7;
}
