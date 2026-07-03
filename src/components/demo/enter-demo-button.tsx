"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Loader2 } from "lucide-react";

/**
 * Creates a demo session via the NextAuth "demo" credentials provider
 * (token: "demo"), then routes into the Review queue. Errors surface inline
 * (the marketing tree has no global Toaster mounted).
 */
export function EnterDemoButton({
  label = "Enter demo account",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnter = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await signIn("demo", { token: "demo", redirect: false });
      if (res?.error) {
        setLoading(false);
        setError("The demo sandbox is unavailable right now. Please try again.");
        return;
      }
      router.push("/review");
      router.refresh();
    } catch {
      setLoading(false);
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleEnter}
        disabled={loading}
        aria-busy={loading}
        className={
          className ??
          "inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        }
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Opening demo…
          </>
        ) : (
          <>
            {label}
            <ArrowRight className="h-5 w-5" />
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
