"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AccountSection({
  userEmail,
  displayName,
}: {
  userEmail: string;
  displayName: string;
}) {
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Card id="account" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Your Triage Mail account details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border p-3">
          {displayName && <div className="font-medium">{displayName}</div>}
          <div className="text-sm text-muted-foreground">{userEmail}</div>
        </div>
        <Button
          variant="outline"
          className="gap-1.5"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            signOut({ callbackUrl: "/signin" });
          }}
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}
