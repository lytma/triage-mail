"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Archive,
  Flag,
  Paperclip,
  FolderOpen,
  Search,
  X,
  Info,
  Ban,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@/components/review/shared";

/** Folder slug → the Classification value it corresponds to (for move exclude). */
const SLUG_TO_CATEGORY: Record<string, MoveCategory> = {
  fyi: "fyi",
  newsletters: "newsletter",
  marketing: "marketing",
  receipts: "receipt",
  automated_notifications: "automated_notification",
};

/** Folders where a one-click unsubscribe action is offered. */
const UNSUBSCRIBE_SLUGS = new Set(["marketing", "newsletters"]);

interface FolderEmail {
  id: string;
  senderEmail: string;
  senderName: string | null;
  subject: string | null;
  receivedAt: string;
  provider: Provider;
  mailboxEmail: string;
  isFlaggedLowConfidence: boolean;
  isArchived: boolean;
  hasAttachments: boolean;
  canUnsubscribe: boolean;
  triageReason: string | null;
  triageConfidence: number | null;
}

interface ApiResponse {
  folder: { id: string; name: string; slug: string };
  items: FolderEmail[];
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

export function CategoryFolderView({
  slug,
  isDemo,
}: {
  slug: string;
  isDemo: boolean;
}) {
  const [items, setItems] = React.useState<FolderEmail[]>([]);
  const [folderName, setFolderName] = React.useState<string>("");
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  // filters
  const [senderInput, setSenderInput] = React.useState("");
  const [debouncedSender, setDebouncedSender] = React.useState("");
  const [flaggedOnly, setFlaggedOnly] = React.useState(false);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  // selection
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = React.useState<Set<string>>(new Set());
  const lastClickedIndex = React.useRef<number | null>(null);

  // debounce sender input
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSender(senderInput), 300);
    return () => window.clearTimeout(t);
  }, [senderInput]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: "1", limit: "100" });
      if (debouncedSender.trim()) params.set("sender", debouncedSender.trim());
      if (flaggedOnly) params.set("flaggedOnly", "true");
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(
        `/api/category-folders/${encodeURIComponent(slug)}/emails?${params.toString()}`,
        { headers: { accept: "application/json" } }
      );
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data: ApiResponse = await res.json();
      setItems(data.items);
      setFolderName(data.folder?.name ?? slug);
      setTotal(data.total);
      setLastUpdated(new Date());
      // drop selections no longer present
      setSelectedIds((prev) => {
        const present = new Set(data.items.map((i) => i.id));
        const next = new Set<string>();
        prev.forEach((id) => present.has(id) && next.add(id));
        return next;
      });
      lastClickedIndex.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [slug, debouncedSender, flaggedOnly, dateFrom, dateTo]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelectedIds((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))
    );
  };

  const toggleRow = (index: number, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const item = items[index];
      if (shiftKey && lastClickedIndex.current != null) {
        const [start, end] = [
          Math.min(lastClickedIndex.current, index),
          Math.max(lastClickedIndex.current, index),
        ];
        // selection direction follows the target row's new state
        const willSelect = !next.has(item.id);
        for (let i = start; i <= end; i++) {
          if (willSelect) next.add(items[i].id);
          else next.delete(items[i].id);
        }
      } else if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
    lastClickedIndex.current = index;
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkArchive = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const emailMetadataIds = ids;

    // optimistic fade + remove
    setRemovingIds(new Set(ids));
    const snapshot = items;
    window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
      setTotal((t) => Math.max(0, t - ids.length));
      setRemovingIds(new Set());
      setSelectedIds(new Set());
    }, 180);

    try {
      const res = await fetch(
        `/api/category-folders/${encodeURIComponent(slug)}/bulk-archive`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emailMetadataIds }),
        }
      );
      if (!res.ok) throw new Error();
      const data: { archivedCount: number; syncedToProvider: boolean } =
        await res.json();
      toast.success(
        `Archived ${data.archivedCount} email${data.archivedCount === 1 ? "" : "s"}`,
        {
          description:
            isDemo || !data.syncedToProvider
              ? "Demo mode — not synced to a real mailbox."
              : "Synced to your mailbox.",
        }
      );
    } catch {
      // restore on failure
      setItems(snapshot);
      setTotal(snapshot.length);
      setRemovingIds(new Set());
      toast.error("Couldn't archive — please try again");
    }
  };

  // Optimistically drop a single row (used by move + unsubscribe).
  const removeOne = (id: string) => {
    setRemovingIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setRemovingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 180);
  };

  const moveEmail = async (item: FolderEmail, category: MoveCategory) => {
    if (SLUG_TO_CATEGORY[slug] === category) return; // already in this folder
    const snapshot = items;
    removeOne(item.id);
    try {
      const res = await fetch(`/api/emails/${item.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classification: category }),
      });
      if (!res.ok) throw new Error();
      toast.success("Moved — I'll file mail from this sender here from now on");
    } catch {
      setItems(snapshot);
      setTotal(snapshot.length);
      toast.error("Couldn't move — please try again");
    }
  };

  const unsubscribeEmail = async (item: FolderEmail) => {
    const snapshot = items;
    removeOne(item.id);
    try {
      const res = await fetch(`/api/emails/${item.id}/unsubscribe`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't unsubscribe.");
      toast.success("Unsubscribe requested", {
        description:
          isDemo || !data.syncedToProvider
            ? "Demo mode — not actually sent."
            : "We'll unsubscribe you and archive this email.",
      });
    } catch (e) {
      setItems(snapshot);
      setTotal(snapshot.length);
      toast.error(e instanceof Error ? e.message : "Couldn't unsubscribe — please try again");
    }
  };

  const showUnsubscribe = UNSUBSCRIBE_SLUGS.has(slug);
  const excludeCategory = SLUG_TO_CATEGORY[slug];

  const hasActiveFilters =
    Boolean(debouncedSender) || flaggedOnly || Boolean(dateFrom) || Boolean(dateTo);

  const resetFilters = () => {
    setSenderInput("");
    setFlaggedOnly(false);
    setDateFrom("");
    setDateTo("");
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 flex-col p-4 md:p-8">
        {/* Header */}
        <header className="mb-4">
          <h1 className="text-2xl font-bold capitalize tracking-tight">
            {folderName || slug.replace(/_/g, " ")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? (
              "Loading…"
            ) : (
              <>
                <span className="font-medium text-foreground">{total}</span>{" "}
                email{total === 1 ? "" : "s"}
                {lastUpdated && (
                  <>
                    {" · "}updated {shortDate(lastUpdated.toISOString())}
                  </>
                )}
              </>
            )}
          </p>
        </header>

        {/* Filter bar */}
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-3">
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="sender-filter"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Filter by sender
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="sender-filter"
                value={senderInput}
                onChange={(e) => setSenderInput(e.target.value)}
                placeholder="name or email…"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="date-from"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              From
            </label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <div>
            <label
              htmlFor="date-to"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              To
            </label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={flaggedOnly}
              onCheckedChange={(v) => setFlaggedOnly(Boolean(v))}
              aria-label="Show flagged only"
            />
            <span className="inline-flex items-center gap-1">
              <Flag className="h-3.5 w-3.5 text-destructive" /> Flagged only
            </span>
          </label>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>

        {/* List */}
        <div className="min-h-0 flex-1">
          {loading ? (
            <FolderSkeleton />
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
            <EmptyState hasFilters={hasActiveFilters} onReset={resetFilters} />
          ) : (
            <div className="overflow-hidden rounded-card border border-border">
              {/* select-all header */}
              <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-2">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all emails"
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : `Select all (${items.length})`}
                </span>
              </div>

              <ul role="list" className="divide-y divide-border">
                {items.map((item, index) => (
                  <FolderRow
                    key={item.id}
                    item={item}
                    selected={selectedIds.has(item.id)}
                    removing={removingIds.has(item.id)}
                    onToggle={(shiftKey) => toggleRow(index, shiftKey)}
                    excludeCategory={excludeCategory}
                    showUnsubscribe={showUnsubscribe}
                    onMove={(cat) => void moveEmail(item, cat)}
                    onUnsubscribe={() => void unsubscribeEmail(item)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sticky bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="sticky bottom-0 z-20 mt-4 animate-in slide-in-from-bottom-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card px-4 py-3 shadow-card">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {selectedIds.size} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="text-muted-foreground"
                >
                  Clear selection
                </Button>
              </div>
              <Button size="sm" onClick={() => void bulkArchive()}>
                <Archive className="h-4 w-4" /> Archive{" "}
                {selectedIds.size === 1 ? "email" : `${selectedIds.size} emails`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function FolderRow({
  item,
  selected,
  removing,
  onToggle,
  excludeCategory,
  showUnsubscribe,
  onMove,
  onUnsubscribe,
}: {
  item: FolderEmail;
  selected: boolean;
  removing: boolean;
  onToggle: (shiftKey: boolean) => void;
  excludeCategory?: MoveCategory;
  showUnsubscribe: boolean;
  onMove: (category: MoveCategory) => void;
  onUnsubscribe: () => void;
}) {
  const low = item.isFlaggedLowConfidence || confidenceIsLow(item.triageConfidence);
  const displayName = item.senderName || item.senderEmail;

  // Drive selection through the checkbox click so we can read shiftKey.
  // onCheckedChange is intentionally a no-op — click is the single source of truth.
  const onCheckboxClick = (e: React.MouseEvent) => {
    onToggle(e.shiftKey);
  };

  return (
    <li
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 transition-all duration-200",
        selected ? "bg-primary/5" : "bg-card hover:bg-muted/40",
        removing && "translate-x-2 opacity-0"
      )}
    >
      <span className="pt-0.5">
        <Checkbox
          checked={selected}
          aria-label={`Select email from ${displayName}`}
          onCheckedChange={() => {}}
          onClick={onCheckboxClick}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {displayName}
          </span>
          {low && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex text-destructive"
                  aria-label="Low confidence — possible misclassification"
                >
                  <Flag className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Low confidence — possible misclassification
              </TooltipContent>
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

        <p className="mt-0.5 truncate text-sm text-foreground">
          {item.subject || "(no subject)"}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <ProviderIndicator
            provider={item.provider}
            mailboxEmail={item.mailboxEmail}
          />
          <ConfidenceBadge confidence={item.triageConfidence} />
          {item.triageReason && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help items-center gap-1 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  <span className="hidden max-w-[280px] truncate italic sm:inline">
                    {item.triageReason}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {item.triageReason}
              </TooltipContent>
            </Tooltip>
          )}
          {item.isArchived && <Badge variant="secondary">Archived</Badge>}
        </div>
      </div>

      {/* Per-row actions: unsubscribe (marketing/newsletters) + move to category */}
      <div className="flex shrink-0 items-center gap-0.5">
        {showUnsubscribe && item.canUnsubscribe && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label="Unsubscribe from this sender"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnsubscribe();
                }}
              >
                <Ban className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Unsubscribe</TooltipContent>
          </Tooltip>
        )}
        <MoveToMenu exclude={excludeCategory} stopPropagation onMove={onMove} />
      </div>
    </li>
  );
}

function EmptyState({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-muted/30 px-6 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <FolderOpen className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-semibold">
        {hasFilters ? "No emails match your filters" : "No emails in this category"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {hasFilters
          ? "Try adjusting or clearing the filters to see more."
          : "You're all caught up — nothing filed here right now."}
      </p>
      {hasFilters && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onReset}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

function FolderSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-card border border-border"
      aria-hidden="true"
    >
      <div className="border-b border-border bg-muted/40 px-3 py-2">
        <Skeleton className="h-4 w-24" />
      </div>
      <ul className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="flex items-start gap-3 px-3 py-2.5">
            <Skeleton className="mt-0.5 h-4 w-4 rounded-sm" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="mt-2 h-4 w-2/3" />
              <div className="mt-2 flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
