import type { MetadataRoute } from "next";
import { getRequestOrigin } from "@/server/lib/request-url";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getRequestOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/demo"],
        disallow: ["/app/", "/review", "/folders", "/compose", "/settings", "/stats", "/admin", "/api/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
