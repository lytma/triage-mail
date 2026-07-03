"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DemoLogin {
  label: string;
  email: string;
  password: string;
}

export function SignInForm({
  googleEnabled,
  microsoftEnabled,
  showSeedUi,
  demoLogins,
}: {
  googleEnabled: boolean;
  microsoftEnabled: boolean;
  showSeedUi: boolean;
  demoLogins: DemoLogin[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [hintOpen, setHintOpen] = useState(true);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("password", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/review");
    router.refresh();
  }

  async function tryDemo() {
    setLoading(true);
    const res = await signIn("demo", { token: "demo", redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Demo account is unavailable.");
      return;
    }
    router.push("/review");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {showSeedUi && hintOpen && demoLogins.length > 0 && (
        <div className="relative rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          <button
            aria-label="Dismiss hint"
            onClick={() => setHintOpen(false)}
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
          <p className="font-semibold text-foreground">Preview credentials</p>
          <p className="mt-1">
            {demoLogins[0].email} / {demoLogins[0].password}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {(googleEnabled || microsoftEnabled) && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          {googleEnabled && (
            <Button variant="outline" className="w-full" onClick={() => (window.location.href = "/api/auth/google/start")}>
              Sign in with Google
            </Button>
          )}
          {microsoftEnabled && (
            <Button variant="outline" className="w-full" onClick={() => signIn("microsoft-entra-id")}>
              Sign in with Microsoft
            </Button>
          )}
        </>
      )}

      {showSeedUi && demoLogins.length > 0 && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setShowDemo((v) => !v)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Demo accounts
          </button>
          {showDemo && (
            <div className="mt-2 space-y-1 rounded-md border border-border p-2 text-left">
              {demoLogins.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="font-medium">{d.label}</span>
                  <span className="block text-xs text-muted-foreground">{d.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border pt-4 text-center">
        <button
          type="button"
          onClick={tryDemo}
          disabled={loading}
          className="text-sm font-medium text-primary hover:underline"
        >
          View demo account →
        </button>
      </div>
    </div>
  );
}
