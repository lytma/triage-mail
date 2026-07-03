import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triage Mail — AI email triage that surfaces only what matters",
  description:
    "Triage Mail unifies your Gmail and Outlook inboxes and uses AI to surface only important mail in a prioritized Review queue.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
