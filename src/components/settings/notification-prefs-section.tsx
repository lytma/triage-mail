"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

interface Subscription {
  id: string;
  endpoint: string;
  isActive: boolean;
  createdAt: string;
}

/** Convert a base64url VAPID key into an ArrayBuffer applicationServerKey. */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return buffer;
}

/** base64url-encode an ArrayBuffer from getKey(). */
function bufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function shortEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    const tail = endpoint.slice(-8);
    return `${url.hostname} …${tail}`;
  } catch {
    return endpoint.slice(0, 40);
  }
}

export function NotificationPrefsSection({ isDemo }: { isDemo: boolean }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission);
    if (!isDemo && ok) loadSubs();
  }, [isDemo]);

  async function loadSubs() {
    try {
      const res = await fetch("/api/notifications/subscriptions");
      const data = await res.json();
      const list: Subscription[] = data.subscriptions ?? [];
      setSubs(list);
      // Reflect enabled state if this browser's push subscription is registered.
      const reg = await navigator.serviceWorker.getRegistration();
      const existing = await reg?.pushManager.getSubscription();
      if (existing) {
        setEnabled(list.some((s) => s.endpoint === existing.endpoint && s.isActive));
      } else {
        setEnabled(false);
      }
    } catch {
      // Non-fatal.
    }
  }

  async function subscribe() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Notification permission was not granted.");
        setEnabled(false);
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const keyRes = await fetch("/api/notifications/vapid-public-key");
      const { vapidPublicKey } = await keyRes.json();
      if (!vapidPublicKey) throw new Error("No VAPID key available.");

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
      });

      const p256dhKey = bufferToBase64Url(sub.getKey("p256dh"));
      const authSecret = bufferToBase64Url(sub.getKey("auth"));

      const res = await fetch("/api/notifications/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, p256dhKey, authSecret }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Couldn't save the subscription.");
      }
      setEnabled(true);
      toast.success("Important-email notifications are on.");
      await loadSubs();
    } catch (err) {
      setEnabled(false);
      toast.error(
        err instanceof Error ? err.message : "Couldn't enable notifications."
      );
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const existing = await reg?.pushManager.getSubscription();
      if (existing) {
        const match = subs.find((s) => s.endpoint === existing.endpoint);
        await existing.unsubscribe().catch(() => {});
        if (match) {
          await fetch(`/api/notifications/subscriptions/${match.id}`, {
            method: "DELETE",
          }).catch(() => {});
        }
      }
      setEnabled(false);
      toast("Notifications turned off for this device.");
      await loadSubs();
    } catch {
      toast.error("Couldn't turn off notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSub(sub: Subscription) {
    setBusy(true);
    try {
      const res = await fetch(`/api/notifications/subscriptions/${sub.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setSubs((prev) => prev.filter((s) => s.id !== sub.id));
      toast.success("Device removed.");
      // If we removed this browser's subscription, reflect the toggle.
      const reg = await navigator.serviceWorker.getRegistration();
      const existing = await reg?.pushManager.getSubscription();
      if (existing?.endpoint === sub.endpoint) {
        await existing.unsubscribe().catch(() => {});
        setEnabled(false);
      }
    } catch {
      toast.error("Couldn't remove the device.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    try {
      if (permission !== "granted") {
        toast.error("Enable notifications first.");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification("Triage Mail", {
          body: "This is a test notification. Important mail will look like this.",
          icon: "/brand/logo.png",
          data: { url: "/review" },
        });
      } else {
        new Notification("Triage Mail", {
          body: "This is a test notification.",
        });
      }
    } catch {
      toast.error("Couldn't show a test notification.");
    }
  }

  return (
    <Card id="notifications" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Get a web push alert only when important mail enters your Review queue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isDemo ? (
          <div className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm">
            Notifications are not available in demo mode.
          </div>
        ) : supported === false ? (
          <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            Web push isn&apos;t supported in this browser.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div className="flex items-center gap-3">
                {enabled ? (
                  <BellRing className="h-5 w-5 text-primary" />
                ) : (
                  <Bell className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <Label htmlFor="notif-toggle" className="font-medium">
                    Important-email push
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable on this device to be notified of new important mail.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch
                  id="notif-toggle"
                  checked={enabled}
                  disabled={busy || supported === null}
                  onCheckedChange={(v) => (v ? subscribe() : unsubscribe())}
                  aria-label="Toggle important-email push notifications"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={sendTest}
                disabled={permission !== "granted"}
              >
                Send test notification
              </Button>
            </div>

            {subs.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Active devices
                </p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {subs.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                        {shortEndpoint(s.endpoint)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label="Remove device"
                        disabled={busy}
                        onClick={() => removeSub(s)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
