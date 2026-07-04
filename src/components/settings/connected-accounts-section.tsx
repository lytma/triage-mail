"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProviderIndicator, type Provider } from "@/components/review/shared";
import { toast } from "@/components/ui/use-toast";

interface Mailbox {
  id: string;
  provider: string;
  emailAddress: string;
  syncState: "active" | "paused" | "error" | "disconnected";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

function StatusBadge({ state }: { state: Mailbox["syncState"] }) {
  switch (state) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "paused":
      return <Badge variant="warning">Syncing</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    case "disconnected":
      return <Badge variant="destructive">Disconnected</Badge>;
    default:
      return <Badge variant="secondary">{state}</Badge>;
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function ConnectedAccountsSection({ isDemo }: { isDemo: boolean }) {
  const [mailboxes, setMailboxes] = useState<Mailbox[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState<Mailbox | null>(null);
  const [imapOpen, setImapOpen] = useState(false);
  const [imapEmail, setImapEmail] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapBusy, setImapBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/connected-mailboxes");
      const data = await res.json();
      setMailboxes(data.mailboxes ?? []);
    } catch {
      setMailboxes([]);
      toast.error("Couldn't load connected accounts.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function connect(provider: "gmail" | "outlook") {
    setConnecting(true);
    try {
      const res = await fetch("/api/connected-mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't start connection.");
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        toast.error("No redirect returned from the provider.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't connect mailbox.");
    } finally {
      setConnecting(false);
    }
  }

  async function connectImap() {
    setImapBusy(true);
    try {
      const res = await fetch("/api/connected-mailboxes/imap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: imapEmail.trim(), password: imapPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't connect mailbox.");
      toast.success(
        `Connected ${data?.mailbox?.emailAddress ?? imapEmail.trim()}${
          data?.detected ? ` (${data.detected})` : ""
        }. Sync is starting.`
      );
      setImapOpen(false);
      setImapEmail("");
      setImapPassword("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't connect mailbox.");
    } finally {
      setImapBusy(false);
    }
  }

  async function reconnect(m: Mailbox) {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/connected-mailboxes/${m.id}/reconnect`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't start reconnection.");
      if (data.redirectUrl) window.location.href = data.redirectUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reconnect mailbox.");
    } finally {
      setBusyId(null);
    }
  }

  async function disconnect(m: Mailbox) {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/connected-mailboxes/${m.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Couldn't disconnect mailbox.");
      }
      toast.success(`Disconnected ${m.emailAddress}.`);
      setMailboxes((prev) => (prev ? prev.filter((x) => x.id !== m.id) : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect mailbox.");
    } finally {
      setBusyId(null);
      setConfirmDisconnect(null);
    }
  }

  return (
    <Card id="connected-accounts" className="scroll-mt-20">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Connected accounts</CardTitle>
          <CardDescription>
            Gmail, Outlook, and IMAP (iCloud, Yahoo, Fastmail) mailboxes synced
            to your Review queue.
          </CardDescription>
        </div>
        {!isDemo && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={connecting}>
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Connect mailbox
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => connect("gmail")}>
                <ProviderIndicator provider="gmail" /> Gmail
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => connect("outlook")}>
                <ProviderIndicator provider="outlook" /> Outlook
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImapOpen(true)}>
                <ProviderIndicator provider="imap" /> iCloud, Yahoo, Fastmail…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isDemo && (
          <div className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm">
            Connecting mailboxes is disabled in demo mode.
          </div>
        )}

        {mailboxes === null ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : mailboxes.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No mailboxes connected yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {mailboxes.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderIndicator provider={m.provider as Provider} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.emailAddress}</div>
                    <div className="text-xs text-muted-foreground">
                      Last synced {relativeTime(m.lastSyncedAt)}
                      {m.lastSyncError ? ` · ${m.lastSyncError}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge state={m.syncState} />
                  {m.syncState === "disconnected" && !isDemo && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={busyId === m.id}
                      onClick={() => reconnect(m)}
                    >
                      {busyId === m.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Reconnect
                    </Button>
                  )}
                  {!isDemo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground hover:text-destructive"
                      disabled={busyId === m.id}
                      onClick={() => setConfirmDisconnect(m)}
                      aria-label={`Disconnect ${m.emailAddress}`}
                    >
                      <Trash2 className="h-4 w-4" />
                      Disconnect
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={imapOpen} onOpenChange={(o) => !o && setImapOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect an IMAP mailbox</DialogTitle>
            <DialogDescription>
              Works with iCloud, Yahoo, Fastmail, and other IMAP providers.
              Server settings are detected automatically — just enter your email
              and an app-specific password (not your normal login password).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="imap-email">Email address</Label>
              <Input
                id="imap-email"
                type="email"
                autoComplete="email"
                placeholder="you@icloud.com"
                value={imapEmail}
                onChange={(e) => setImapEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imap-password">App-specific password</Label>
              <Input
                id="imap-password"
                type="password"
                autoComplete="off"
                placeholder="xxxx-xxxx-xxxx-xxxx"
                value={imapPassword}
                onChange={(e) => setImapPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Create one in your provider&apos;s security settings. We store it
                encrypted and use it only to sync your mail.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImapOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={imapBusy || !imapEmail.trim() || !imapPassword}
              onClick={() => void connectImap()}
            >
              {imapBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDisconnect !== null}
        onOpenChange={(o) => !o && setConfirmDisconnect(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect mailbox?</DialogTitle>
            <DialogDescription>
              {confirmDisconnect
                ? `${confirmDisconnect.emailAddress} will stop syncing. Existing triaged items remain, but no new mail will be processed.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDisconnect(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => confirmDisconnect && disconnect(confirmDisconnect)}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
