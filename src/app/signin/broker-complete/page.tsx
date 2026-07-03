"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

function Bridge() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const sub = params.get("sub") ?? "";
    const email = params.get("email") ?? "";
    const name = params.get("name") ?? "";
    signIn("broker", { sub, email, name, verified: "true", redirect: false }).then(
      (res) => {
        if (res?.error) router.replace("/signin?error=google_failed");
        else {
          router.replace("/review");
          router.refresh();
        }
      },
    );
  }, [params, router]);

  return <p className="text-sm text-muted-foreground">Completing sign-in…</p>;
}

export default function BrokerCompletePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Bridge />
      </Suspense>
    </main>
  );
}
