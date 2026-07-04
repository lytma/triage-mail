import * as React from "react";
import { Mail, FolderInput } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type Provider = "gmail" | "outlook" | "imap";

/** The fixed category catalog a user can move an email into (Classification enum). */
export type MoveCategory =
  | "important"
  | "fyi"
  | "newsletter"
  | "marketing"
  | "receipt"
  | "automated_notification";

export const MOVE_CATEGORIES: { value: MoveCategory; label: string }[] = [
  { value: "important", label: "Important (Review queue)" },
  { value: "fyi", label: "FYI" },
  { value: "newsletter", label: "Newsletters" },
  { value: "marketing", label: "Marketing" },
  { value: "receipt", label: "Receipts" },
  { value: "automated_notification", label: "Automated Notifications" },
];

/**
 * "Move to category" menu — lets the user correct a misclassification. The app
 * learns from the move (instant per-sender rule + gradual AI feedback).
 */
export function MoveToMenu({
  onMove,
  exclude,
  stopPropagation,
}: {
  onMove: (category: MoveCategory) => void;
  /** Hide the current category from the list. */
  exclude?: MoveCategory;
  stopPropagation?: boolean;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="Move to category"
              onClick={(e) => stopPropagation && e.stopPropagation()}
            >
              <FolderInput className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Move to category</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" onClick={(e) => stopPropagation && e.stopPropagation()}>
        <DropdownMenuLabel>Move to…</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MOVE_CATEGORIES.filter((c) => c.value !== exclude).map((c) => (
          <DropdownMenuItem key={c.value} onClick={() => onMove(c.value)}>
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Small colored provider indicator: Gmail = red-ish, Outlook = blue-ish,
 * IMAP (iCloud/Yahoo/Fastmail) = emerald.
 */
export function ProviderIndicator({
  provider,
  mailboxEmail,
  className,
}: {
  provider: Provider;
  mailboxEmail?: string;
  className?: string;
}) {
  const label =
    provider === "gmail" ? "Gmail" : provider === "outlook" ? "Outlook" : "IMAP";
  const color =
    provider === "gmail"
      ? "bg-red-100 text-red-600"
      : provider === "outlook"
        ? "bg-blue-100 text-blue-600"
        : "bg-emerald-100 text-emerald-700";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
      title={mailboxEmail ? `${label} · ${mailboxEmail}` : label}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-md",
          color
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
