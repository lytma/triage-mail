"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";

interface Sub {
  plan: string | null;
  status: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: string | null) {
  switch (status) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "trialing":
    case "trial":
      return <Badge variant="warning">Trial</Badge>;
    case "past_due":
      return <Badge variant="destructive">Past due</Badge>;
    case "canceled":
    case "cancelled":
      return <Badge variant="secondary">Canceled</Badge>;
    default:
      return status ? <Badge variant="secondary">{status}</Badge> : null;
  }
}

export function SubscriptionSection() {
  const [sub, setSub] = useState<Sub | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/subscription");
      const data = await res.json();
      setSub(data);
    } catch {
      toast.error("Couldn't load your subscription.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function checkout(plan: "monthly" | "yearly") {
    setBusy(true);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't start checkout.");
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else toast.error("No checkout URL returned.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start checkout.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch("/api/subscription/cancel", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't cancel.");
      toast.success("Subscription canceled.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel.");
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  const isActive = sub?.status === "active";
  const isTrial = sub?.status === "trialing" || sub?.status === "trial";

  return (
    <Card id="subscription" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
        <CardDescription>Manage your Triage Mail plan and billing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="py-2 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">
                    {sub?.plan ? `${sub.plan} plan` : "No active plan"}
                  </span>
                  {statusBadge(sub?.status ?? null)}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isTrial && sub?.trialEndsAt
                    ? `Trial ends ${fmtDate(sub.trialEndsAt)}`
                    : sub?.currentPeriodEnd
                      ? `${isActive ? "Renews" : "Ends"} ${fmtDate(sub.currentPeriodEnd)}`
                      : "Subscribe to keep your mailboxes syncing."}
                </p>
              </div>
            </div>

            {!isActive && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  onClick={() => checkout("monthly")}
                  disabled={busy}
                  className="gap-1.5"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Subscribe monthly ($12)
                </Button>
                <Button
                  variant="outline"
                  onClick={() => checkout("yearly")}
                  disabled={busy}
                  className="gap-1.5"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Subscribe yearly ($108)
                </Button>
              </div>
            )}

            {isActive && (
              <Button
                variant="outline"
                onClick={() => setConfirmCancel(true)}
                disabled={busy}
              >
                Cancel subscription
              </Button>
            )}

            <p className="text-xs text-muted-foreground">
              Billing is handled securely by our payment provider. Yearly billing
              saves roughly two months versus monthly.
            </p>
          </>
        )}
      </CardContent>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              Your mailboxes will stop syncing at the end of the current billing
              period. You can resubscribe any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep subscription
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={busy}>
              Cancel subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
