import { listTiers, listCategories } from "@/lib/entries/queries";
import { getCurrentUser } from "@/lib/auth/current-user";
import { authorizedSiteScope } from "@/lib/auth/authorization";
import { listViewsForUser } from "@/lib/views/data";
import { ContentPageClient } from "./content-page-client";
import { ContentViews } from "@/components/layout/content-views";

export const metadata = {
  title: "Content",
};

type SearchParams = Promise<{ entry?: string | string[] }>;

export default async function ContentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) return null;
  const params = await searchParams;
  const initialEntryId =
    typeof params.entry === "string" ? params.entry : null;
  const managerScope = authorizedSiteScope(
    viewer,
    "manager",
    "admin",
    "eic",
    "operations",
  );
  const manageableSites: Array<"pl" | "qb"> =
    managerScope === "both"
      ? ["pl", "qb"]
      : managerScope
        ? [managerScope]
        : [];

  const [tiers, categories, views] = await Promise.all([
    listTiers(),
    listCategories(),
    listViewsForUser(viewer.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-cell">Content</h1>
          <p className="mt-1 text-sm text-text-team">
            The pipeline. Every article, every tier, every status in one table.
          </p>
        </div>
      </div>

      <ContentViews active="table" />
      <ContentPageClient
        tiers={tiers}
        categories={categories}
        initialViews={views}
        initialEntryId={initialEntryId}
        manageableSites={manageableSites}
      />
    </div>
  );
}
