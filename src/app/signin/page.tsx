import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignInForm } from "@/components/signin-form";
import { getSessionUser } from "@/server/lib/session";
import { features, googleLoginEnabled } from "@/server/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Triage Mail",
  robots: { index: false, follow: false },
};

const DEMO_LOGINS = [
  { label: "Primary account (admin)", email: "admin@example.com", password: "Admin!2345" },
];

export default async function SignInPage() {
  const user = await getSessionUser();
  if (user) redirect("/review");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand href="/" />
        </div>
        <div className="rounded-card border border-border bg-card p-8 shadow-card">
          <h1 className="mb-1 text-2xl font-bold">Welcome back</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Sign in to your Triage Mail account.
          </p>
          <SignInForm
            googleEnabled={googleLoginEnabled()}
            microsoftEnabled={features.microsoft}
            showSeedUi={features.showSeedUi}
            demoLogins={features.showSeedUi ? DEMO_LOGINS : []}
          />
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/demo" className="font-semibold text-primary hover:underline">
            Explore the demo account
          </Link>{" "}
          — no signup required.
        </p>
      </div>
    </main>
  );
}
