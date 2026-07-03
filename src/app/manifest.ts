import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Triage Mail",
    short_name: "Triage Mail",
    description:
      "AI email triage that unifies Gmail and Outlook and surfaces only important mail in a prioritized Review queue.",
    start_url: "/review",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563EB",
    icons: [
      { src: "/brand/logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
