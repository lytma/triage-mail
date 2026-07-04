"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Reply,
  Forward,
  Archive,
  CheckCheck,
  Flag,
  Paperclip,
  Inbox,
  PanelRightOpen,
  PanelRightClose,
  Info,
  ArrowRight,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ConfidenceBadge,
  ProviderIndicator,
  MoveToMenu,
  confidenceIsLow,
  type Provider,
  type MoveCategory,
} from "./shared";

export interface ReviewItem {
  id: string;
  emailMetadataId: string;
  status: string;
  senderEmail: string;
  senderName: string | null;
  subject: string | null;
  receivedAt: string;
  provider: Provider;
  mailboxEmail: string;
  hasAttachments: boolean;
  importanceScore: number;
  isFlaggedLowConfidence: boolean;
  triageReason: string | null;
  triageConfidence: number | null;
  threadId: string | null;
}

interface ApiResponse {
  items: ReviewItem[];
  total: number;
  page: number;
}

function shortDate(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function isReplied(status: string) {
  return status === "replied";
}
function isForwarded(status: string) {
  return status === "forwarded";
}

export function ReviewQueue({ isDemo }: { isDemo: boolean }) {
  const router = useRouter();
  const [items, setItems] = React.useState<ReviewItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [paneOpen, setPaneOpen] = React.useState(false);
  const [removingIds, setRemovingIds] = React.useState<Set<string>>(new Set());

  const rowRefs = React.useRef<Map<string, HTMLLIElement>>(new Map());

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/review-queue?page=1&limit=50", {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data: ApiResponse = await res.json();
      setItems(data.items);
      setLastUpdated(new Date());
      setSelectedId((prev) =>
        prev && data.items.some((i) => i.id === prev)
          ? prev
          : data.items[0]?.id ?? null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  // --- Clear (archive / mark done) with optimistic remove + Undo toast ---
  const clearItem = React.useCallback(
    async (item: ReviewItem, action: "archived" | "done") => {
      // fade-out animation, then remove from list
      setRemovingIds((prev) => new Set(prev).add(item.id));
      const idx = items.findIndex((i) => i.id === item.id);

      window.setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setSelectedId((prev) => {
          if (prev !== item.id) return prev;
          const remaining = items.filter((i) => i.id !== item.id);
          const nextSel = remaining[Math.min(idx, remaining.length - 1)];
          return nextSel?.id ?? null;
        });
      }, 180);

      let undone = false;
      const restore = async () => {
        undone = true;
        try {
          await fetch(`/api/review-queue/${item.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "pending" }),
          });
        } catch {
          /* best effort */
        }
        // re-insert at original position
        setItems((prev) => {
          if (prev.some((i) => i.id === item.id)) return prev;
          const next = [...prev];
          next.splice(Math.min(idx, next.length), 0, item);
          return next;
        });
        setSelectedId(item.id);
      };

      try {
        const res = await fetch(`/api/review-queue/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: action }),
        });
        if (!res.ok) throw new Error();
      } catch {
        if (!undone) {
          setItems((prev) =>
            prev.some((i) => i.id === item.id) ? prev : [...prev, item]
          );
          toast.error("Couldn't update — please try again");
          return;
        }
      }

      toast(action === "archived" ? "Email archived" : "Marked done", {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            if (!undone) void restore();
          },
        },
      });
    },
    [items]
  );

  const goCompose = React.useCallback(
    (item: ReviewItem, mode: "reply" | "forward") => {
      router.push(`/compose?mode=${mode}&itemId=${item.id}`);
    },
    [router]
  );

  // --- Move to a different category (a manual correction the app learns from) ---
  const moveItem = React.useCallback(
    async (item: ReviewItem, category: MoveCategory) => {
      if (category === "important") return; // already important
      const idx = items.findIndex((i) => i.id === item.id);
      setRemovingIds((prev) => new Set(prev).add(item.id));
      window.setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setSelectedId((prev) => {
          if (prev !== item.id) return prev;
          const remaining = items.filter((i) => i.id !== item.id);
          return remaining[Math.min(idx, remaining.length - 1)]?.id ?? null;
        });
      }, 180);

      try {
        const res = await fetch(`/api/emails/${item.emailMetadataId}/move`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ classification: category }),
        });
        if (!res.ok) throw new Error();
        toast.success("Moved — I'll file mail from this sender here from now on");
      } catch {
        setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
        toast.error("Couldn't move — please try again");
      }
    },
    [items]
  );

  // --- Keyboard shortcuts ---
  React.useEffect(() => {
    function isTyping(el: EventTarget | null) {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        node.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!items.length) return;

      const curIdx = items.findIndex((i) => i.id === selectedId);
      const cur = items[curIdx] ?? null;

      switch (e.key) {
        case "j":
        case "ArrowDown": {
          e.preventDefault();
          const next = items[Math.min(curIdx + 1, items.length - 1)] ?? items[0];
          setSelectedId(next.id);
          rowRefs.current.get(next.id)?.scrollIntoView({ block: "nearest" });
          rowRefs.current.get(next.id)?.focus();
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          const prev = items[Math.max(curIdx - 1, 0)] ?? items[0];
          setSelectedId(prev.id);
          rowRefs.current.get(prev.id)?.scrollIntoView({ block: "nearest" });
          rowRefs.current.get(prev.id)?.focus();
          break;
        }
        case "Enter": {
          if (cur) {
            e.preventDefault();
            setPaneOpen(true);
          }
          break;
        }
        case "r":
        case "R": {
          if (cur) {
            e.preventDefault();
            goCompose(cur, "reply");
          }
          break;
        }
        case "f":
        case "F": {
          if (cur) {
            e.preventDefault();
            goCompose(cur, "forward");
          }
          break;
        }
        case "e":
        case "E": {
          if (cur) {
            e.preventDefault();
            void clearItem(cur, e.shiftKey ? "done" : "archived");
          }
          break;
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedId, clearItem, goCompose]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 flex-col p-4 md:p-8">
        {/* Header */}
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Review queue</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading ? (
                "Loading…"
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {items.length}
                  </span>{" "}
                  item{items.length === 1 ? "" : "s"} need your attention
                  {lastUpdated && (
                    <>
                      {" · "}updated {shortDate(lastUpdated.toISOString())}
                    </>
                  )}
                </>
              )}
            </p>
            <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
              <KbdHint />
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="hidden lg:inline-flex"
            onClick={() => setPaneOpen((o) => !o)}
            aria-pressed={paneOpen}
          >
            {paneOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
            {paneOpen ? "Hide details" : "Show details"}
          </Button>
        </header>

        {/* Demo CTA */}
        {isDemo && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="text-sm">
              <span className="font-semibold text-primary">
                You're exploring the demo.
              </span>{" "}
              <span className="text-muted-foreground">
                Connect your real Gmail or Outlook mailbox to triage your own
                inbox.
              </span>
            </div>
            <Button asChild size="sm">
              <a href="/signin">Connect your real mailbox</a>
            </Button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-6">
          {/* List */}
          <div className="min-w-0 flex-1">
            {loading ? (
              <QueueSkeleton />
            ) : error ? (
              <div className="rounded-card border border-destructive/30 bg-destructive/5 p-6 text-sm">
                <p className="font-medium text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void load()}
                >
                  Retry
                </Button>
              </div>
            ) : items.length === 0 ? (
              <EmptyState />
            ) : (
              <ul role="list" className="flex flex-col gap-2">
                {items.map((item) => (
                  <ReviewRow
                    key={item.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(item.id, el);
                      else rowRefs.current.delete(item.id);
                    }}
                    item={item}
                    selected={item.id === selectedId}
                    removing={removingIds.has(item.id)}
                    onSelect={() => setSelectedId(item.id)}
                    onOpen={() => {
                      setSelectedId(item.id);
                      setPaneOpen(true);
                    }}
                    onReply={() => goCompose(item, "reply")}
                    onForward={() => goCompose(item, "forward")}
                    onArchive={() => void clearItem(item, "archived")}
                    onDone={() => void clearItem(item, "done")}
                    onMove={(cat) => void moveItem(item, cat)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Reading pane (desktop) */}
          {paneOpen && selected && (
            <aside className="hidden w-[360px] shrink-0 lg:block">
              <div className="sticky top-4">
                <ReadingPane
                  item={selected}
                  onClose={() => setPaneOpen(false)}
                  onReply={() => goCompose(selected, "reply")}
                  onForward={() => goCompose(selected, "forward")}
                  onArchive={() => void clearItem(selected, "archived")}
                  onDone={() => void clearItem(selected, "done")}
                />
              </div>
            </aside>
          )}
        </div>

        {/* Reading pane (mobile drawer) */}
        {paneOpen && selected && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40 animate-in fade-in-0"
              onClick={() => setPaneOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-auto rounded-t-card border-t border-border bg-card p-4 shadow-card animate-in slide-in-from-bottom-4">
              <ReadingPane
                item={selected}
                onClose={() => setPaneOpen(false)}
                onReply={() => goCompose(selected, "reply")}
                onForward={() => goCompose(selected, "forward")}
                onArchive={() => void clearItem(selected, "archived")}
                onDone={() => void clearItem(selected, "done")}
              />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function KbdHint() {
  const keys: [string, string][] = [
    ["J / K", "move"],
    ["R", "reply"],
    ["F", "forward"],
    ["E", "archive"],
    ["⇧ E", "mark done"],
    ["↵", "open"],
  ];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {keys.map(([k, label]) => (
        <span key={k} className="inline-flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
            {k}
          </kbd>
          <span>{label}</span>
        </span>
      ))}
    </span>
  );
}

interface RowProps {
  item: ReviewItem;
  selected: boolean;
  removing: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDone: () => void;
  onMove: (category: MoveCategory) => void;
}

const ReviewRow = React.forwardRef<HTMLLIElement, RowProps>(function ReviewRow(
  {
    item,
    selected,
    removing,
    onSelect,
    onOpen,
    onReply,
    onForward,
    onArchive,
    onDone,
    onMove,
  },
  ref
) {
  const low = item.isFlaggedLowConfidence || confidenceIsLow(item.triageConfidence);
  const displayName = item.senderName || item.senderEmail;

  return (
    <li
      ref={ref}
      role="listitem"
      tabIndex={0}
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onFocus={onSelect}
      className={cn(
        "group relative rounded-card border bg-card p-3 outline-none transition-all duration-200",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-primary/60 ring-1 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
        removing && "translate-x-2 opacity-0"
      )}
    >
      <div className="flex items-start gap-3">
        {selected && (
          <span
            aria-hidden="true"
            className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary"
          />
        )}
        <div className="min-w-0 flex-1">
          {/* Top line: sender + meta */}
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </span>
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {item.senderEmail}
            </span>
            {low && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex text-destructive" aria-label="Low confidence — review carefully">
                    <Flag className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Low confidence — review carefully</TooltipContent>
              </Tooltip>
            )}
            {item.hasAttachments && (
              <Paperclip
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-label="Has attachments"
              />
            )}
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {shortDate(item.receivedAt)}
            </span>
          </div>

          {/* Subject */}
          <p className="mt-0.5 truncate text-sm text-foreground">
            {item.subject || "(no subject)"}
          </p>

          {/* Reason */}
          {item.triageReason && (
            <p className="mt-0.5 line-clamp-1 text-xs italic text-muted-foreground">
              {item.triageReason}
            </p>
          )}

          {/* Bottom line: badges + provider */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ProviderIndicator
              provider={item.provider}
              mailboxEmail={item.mailboxEmail}
            />
            <ConfidenceBadge confidence={item.triageConfidence} />
            {isReplied(item.status) && (
              <Badge variant="secondary">Replied</Badge>
            )}
            {isForwarded(item.status) && (
              <Badge variant="secondary">Forwarded</Badge>
            )}
          </div>
        </div>

        {/* Inline actions */}
        <div className="flex shrink-0 items-center gap-0.5">
          <RowAction
            label="Reply"
            onClick={onReply}
            icon={<Reply className="h-4 w-4" />}
          />
          <RowAction
            label="Forward"
            onClick={onForward}
            icon={<Forward className="h-4 w-4" />}
          />
          <MoveToMenu
            exclude="important"
            stopPropagation
            onMove={onMove}
          />
          <RowAction
            label="Archive"
            onClick={onArchive}
            icon={<Archive className="h-4 w-4" />}
          />
          <RowAction
            label="Mark done"
            onClick={onDone}
            icon={<CheckCheck className="h-4 w-4" />}
          />
        </div>
      </div>
    </li>
  );
});

function RowAction({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ReadingPane({
  item,
  onClose,
  onReply,
  onForward,
  onArchive,
  onDone,
}: {
  item: ReviewItem;
  onClose: () => void;
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDone: () => void;
}) {
  const displayName = item.senderName || item.senderEmail;
  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">Message details</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Close details"
          onClick={onClose}
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      <dl className="space-y-2.5 text-sm">
        <Field label="From">
          <span className="font-medium text-foreground">{displayName}</span>
          <span className="block text-xs text-muted-foreground">
            {item.senderEmail}
          </span>
        </Field>
        <Field label="Subject">{item.subject || "(no subject)"}</Field>
        <Field label="Mailbox">
          <span className="inline-flex items-center gap-2">
            <ProviderIndicator
              provider={item.provider}
              mailboxEmail={item.mailboxEmail}
            />
            <span className="text-xs text-muted-foreground">
              {item.mailboxEmail}
            </span>
          </span>
        </Field>
        <Field label="Received">
          {new Date(item.receivedAt).toLocaleString()}
        </Field>
        <Field label="Attachments">
          {item.hasAttachments ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3.5 w-3.5" /> Yes
            </span>
          ) : (
            "None"
          )}
        </Field>
        <Field label="Confidence">
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={item.triageConfidence} />
            {item.isFlaggedLowConfidence && (
              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                <Flag className="h-3 w-3" /> Flagged
              </span>
            )}
          </div>
        </Field>
        {item.triageReason && (
          <Field label="AI reason">
            <span className="flex items-start gap-1.5 text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{item.triageReason}</span>
            </span>
          </Field>
        )}
        {item.threadId && (
          <Field label="Thread ID">
            <code className="break-all text-xs text-muted-foreground">
              {item.threadId}
            </code>
          </Field>
        )}
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="default" size="sm" onClick={onReply}>
          <Reply className="h-4 w-4" /> Reply
        </Button>
        <Button variant="outline" size="sm" onClick={onForward}>
          <Forward className="h-4 w-4" /> Forward
        </Button>
        <Button variant="outline" size="sm" onClick={onArchive}>
          <Archive className="h-4 w-4" /> Archive
        </Button>
        <Button variant="outline" size="sm" onClick={onDone}>
          <CheckCheck className="h-4 w-4" /> Mark done
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-muted/30 px-6 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Inbox className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-semibold">Your Review queue is clear</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Nothing needs your attention right now. New important mail will appear
        here as it arrives.
      </p>
      <Button variant="outline" size="sm" className="mt-4" asChild>
        <a href="/folders/newsletters">
          Browse category folders <ArrowRight className="h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <ul role="list" className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="rounded-card border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <div className="mt-2 flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        </li>
      ))}
    </ul>
  );
}
