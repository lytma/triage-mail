import type { Metadata } from "next";
import { getSessionUser } from "@/server/lib/session";
import { ReviewQueue } from "@/components/review/review-queue";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review queue · Triage Mail",
};

export default async function ReviewPage() {
  const user = await getSessionUser();
  return (
    <div className="h-full min-h-0">
      <ReviewQueue isDemo={Boolean(user?.isDemo)} />
    </div>
  );
}
