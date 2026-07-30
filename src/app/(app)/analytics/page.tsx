import { redirect } from "next/navigation";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { authorizedSiteScope } from "@/lib/auth/authorization";
import { listCategories, listTiers } from "@/lib/entries/queries";
import { listUsers } from "@/lib/users/queries";
import { AnalyticsPageClient } from "./analytics-page-client";

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

  // Only show people who could plausibly be authors (writer / editor / contributor roles).
  const authorCandidates = staff.users
    .filter((u) =>
      u.role_rows.some(
        (row) =>
          ["writer", "editor", "manager", "admin", "eic", "operations"].includes(
            row.role,
          ) &&
          (row.site === "both" || allowedSites.includes(row.site)),
      ),
    )
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
