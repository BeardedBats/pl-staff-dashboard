import { redirect } from "next/navigation";
import { canViewAnalytics, getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { listCategories, listTiers } from "@/lib/entries/queries";
import { listUsers } from "@/lib/users/queries";
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
      u.roles.some((r) =>
        ["writer", "editor", "manager", "admin", "eic", "operations"].includes(r),
      ),
    )
    .map((u) => ({ id: u.id, display_name: u.display_name }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Analytics</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Pageviews from GA4 and revenue from Raptive, joined to every entry
            in the pipeline. Filter by date, site, tier, category, or author.
          </p>
        </div>
      </div>

      <AnalyticsPageClient
        tiers={tiers}
        categories={categories}
        authorCandidates={authorCandidates}
        isOperations={isOperations(viewer)}
      />
    </div>
  );
}
