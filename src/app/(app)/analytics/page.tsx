import { redirect } from "next/navigation";
import { canViewAnalytics, getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { listTiers } from "@/lib/entries/queries";
import { AnalyticsPageClient } from "./analytics-page-client";

export const metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  if (!canViewAnalytics(viewer)) {
    redirect("/home");
  }

  const tiers = await listTiers();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Analytics</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Pageviews from GA4 and revenue from Raptive, joined to every entry
            in the pipeline. Filter by date, site, tier, or author.
          </p>
        </div>
      </div>

      <AnalyticsPageClient
        tiers={tiers}
        isOperations={isOperations(viewer)}
      />
    </div>
  );
}
