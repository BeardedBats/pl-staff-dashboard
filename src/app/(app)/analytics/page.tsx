import { redirect } from "next/navigation";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { authorizedSiteScope } from "@/lib/auth/authorization";
import { listCategories, listTiers } from "@/lib/entries/queries";
import { listUsers } from "@/lib/users/queries";
import { AnalyticsPageClient } from "./analytics-page-client";
import { DataCoverage } from "@/components/analytics/data-coverage";

export const metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  const analyticsScope = authorizedSiteScope(viewer, "eic", "operations");
  if (!analyticsScope) {
    redirect("/home");
  }
  const allowedSites: Array<"pl" | "qb"> =
    analyticsScope === "both" ? ["pl", "qb"] : [analyticsScope];

  // Preload tiers, categories, and the writer/editor pool in parallel.
  // ~200 staff fits comfortably in memory; no need for a debounced server search.
  const [tiers, categories, staff] = await Promise.all([
    listTiers(),
    listCategories(),
    listUsers({ limit: 300 }),
  ]);

  // Former authors retain reporting identities without receiving dashboard roles.
  const authorCandidates = staff.users
    .filter((u) => u.wp_site === "both" || allowedSites.includes(u.wp_site))
    .map((u) => ({ id: u.id, display_name: u.display_name }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-cell">Analytics</h1>
          <p className="mt-1 text-sm text-text-team">
            GA4 traffic and Raptive revenue. Site totals include every URL;
            article and writer views include revenue matched to dashboard
            entries. Filter by date, site, tier, category, or author.
          </p>
        </div>
      </div>

      {allowedSites.includes("pl") && <DataCoverage />}
      <AnalyticsPageClient
        tiers={tiers}
        categories={categories}
        authorCandidates={authorCandidates}
        isOperations={isOperations(viewer)}
        allowedSites={allowedSites}
      />
    </div>
  );
}
