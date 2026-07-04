import type { MetadataRoute } from "next";
import { getRequestOrigin } from "@/server/lib/request-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await getRequestOrigin();
  const now = new Date();
  return [
    { url: `${origin}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/demo`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];
}
