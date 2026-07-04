"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/use-toast";
import { ConnectedAccountsSection } from "./connected-accounts-section";
import { TriageRulesSection } from "./triage-rules-section";
import { NotificationPrefsSection } from "./notification-prefs-section";
import { AccountSection } from "./account-section";

export function SettingsView({
  isDemo,
  userEmail,
  displayName,
  connectStatus,
}: {
  isDemo: boolean;
  userEmail: string;
  displayName: string;
  connectStatus?: string;
}) {
  // Surface redirect-back toasts from the connect flow once on mount.
  useEffect(() => {
    switch (connectStatus) {
      case "success":
        toast.success("Mailbox connected. Sync is starting.");
        break;
      case "preview_unavailable":
        toast(
          "Connecting live mailboxes isn't available in this preview environment."
        );
        break;
      case "incomplete":
        toast.error("Connection wasn't completed. Please try again.");
        break;
      case "error":
        toast.error("Something went wrong connecting your mailbox.");
        break;
    }
  }, [connectStatus]);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage connected mailboxes, triage rules, notifications, and your
          account.
        </p>
      </header>

      <div className="space-y-8">
        <ConnectedAccountsSection isDemo={isDemo} />
        <TriageRulesSection isDemo={isDemo} />
        <NotificationPrefsSection isDemo={isDemo} />
        <AccountSection userEmail={userEmail} displayName={displayName} />
      </div>
    </div>
  );
}
