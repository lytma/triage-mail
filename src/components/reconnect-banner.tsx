"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

export interface DisconnectedMailbox {
  id: string;
  emailAddress: string;
  provider: string;
}

/**
 * Persistent amber banner shown when one or more mailboxes lost access.
 * Dismiss hides it for the current session only (reappears on next load).
 */
export function ReconnectBanner({ mailboxes }: { mailboxes: DisconnectedMailbox[] }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Reappears each page load; only hidden if dismissed this session.
    const wasDismissed = sessionStorage.getItem("reconnect-dismissed") === "1";
    setDismissed(wasDismissed);
  }, []);

  if (!mailboxes.length || dismissed) return null;

  const many = mailboxes.length > 1;

  async function reconnect(id?: string) {
    const targets = id ? mailboxes.filter((m) => m.id === id) : mailboxes;
    // Kick off reconnect for the first affected mailbox (OAuth redirect flow).
    const first = targets[0];
    if (!first) return;
    const res = await fetch(`/api/connected-mailboxes/${first.id}/reconnect`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (data.redirectUrl) window.location.href = data.redirectUrl;
  }

  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-warning bg-warning/10 px-4 py-3 text-sm"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <span className="flex-1">
        {many ? (
          <>
            <strong>{mailboxes.length} mailboxes lost access.</strong> Sync is
            paused for {mailboxes.map((m) => m.emailAddress).join(", ")}.
          </>
        ) : (
          <>
            <strong>Connection lost for {mailboxes[0].emailAddress}.</strong> Sync
            is paused for this mailbox.
          </>
        )}
      </span>
      <button
        onClick={() => reconnect()}
        className="rounded-btn bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        {many ? "Reconnect all" : "Reconnect now"}
      </button>
      <button
        aria-label="Dismiss"
        onClick={() => {
          sessionStorage.setItem("reconnect-dismissed", "1");
          setDismissed(true);
        }}
        className="rounded p-1 hover:bg-warning/20"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
