import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/lib/session";
import { SettingsView } from "@/components/settings/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  const sp = await searchParams;

  return (
    <SettingsView
      isDemo={user.isDemo}
      userEmail={user.email}
      displayName={user.displayName}
      connectStatus={sp.connect}
    />
  );
}
