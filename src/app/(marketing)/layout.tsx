import type { Metadata } from "next";
import { buildCanonicalUrl } from "@/server/lib/request-url";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = await buildCanonicalUrl("/");
  return {
    metadataBase: new URL(canonical),
    robots: { index: true, follow: true },
  };
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
