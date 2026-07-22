import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getWordPressSiteConfig,
  wordPressBasicAuth,
  type WordPressSiteConfig,
  type WpSiteKey,
} from "@/lib/wordpress/config";
import { fetchAllWpPages } from "@/lib/wp-sync/pagination";

/**
 * WordPress → dashboard category sync.
 *
 * Pulls every category from a WP site and upserts it into the `categories`
 * table. Rows that exist in the dashboard but no longer exist on WP are
 * flipped to `is_active = false` (soft delete) so we keep the historical
 * link to any entries that referenced them.
 *
 * Uniqueness is on (site, wp_category_id). The schema doesn't declare a
 * real UNIQUE constraint there, so we do an explicit select-then-upsert
 * to stay deterministic.
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type CategorySyncReport = {
  site: WpSiteKey;
  fetched: number;
  created: number;
  updated: number;
  deactivated: number;
  errors: string[];
};

type WpCategory = {
  id: number;
  name: string;
};

// --------------------------------------------------------------------------
// Paginated fetch
// --------------------------------------------------------------------------

async function fetchAllCategories(config: WordPressSiteConfig) {
  return fetchAllWpPages<WpCategory>({
    urlForPage: (page) => {
      const params = new URLSearchParams({
        per_page: "100",
        hide_empty: "false",
        page: String(page),
      });
      return `${config.url}/wp-json/wp/v2/categories?${params.toString()}`;
    },
    headers: {
      Authorization: wordPressBasicAuth(
        config.appUsername,
        config.appPassword,
      ),
      Accept: "application/json",
    },
  });
}

// --------------------------------------------------------------------------
// Main: sync one site
// --------------------------------------------------------------------------

export async function syncWpCategoriesForSite(
  site: WpSiteKey,
): Promise<CategorySyncReport> {
  const report: CategorySyncReport = {
    site,
    fetched: 0,
    created: 0,
    updated: 0,
    deactivated: 0,
    errors: [],
  };

  const config = getWordPressSiteConfig(site);
  if (!config) return report;

  const fetched = await fetchAllCategories(config);
  if (!fetched.ok) {
    report.errors.push(fetched.error);
    return report;
  }
  const wpCategories = fetched.rows;

  report.fetched = wpCategories.length;

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // Load everything we already have for this site in one round trip so
  // we can diff by wp_category_id without N+1 lookups.
  const { data: existingRows } = await supabase
    .from("categories")
    .select("id, wp_category_id, name, is_active")
    .eq("site", site);

  const existingBySiteId = new Map<
    number,
    { id: string; name: string; is_active: boolean }
  >();
  for (const row of (existingRows ?? []) as unknown as Array<{
    id: string;
    wp_category_id: number;
    name: string;
    is_active: boolean;
  }>) {
    existingBySiteId.set(row.wp_category_id, {
      id: row.id,
      name: row.name,
      is_active: row.is_active,
    });
  }

  const seenWpIds = new Set<number>();

  for (const cat of wpCategories) {
    try {
      seenWpIds.add(cat.id);
      const existing = existingBySiteId.get(cat.id);

      if (existing) {
        // Only issue an UPDATE if something actually changed.
        if (existing.name !== cat.name || existing.is_active !== true) {
          const { error } = await supabase
            .from("categories")
            .update({
              name: cat.name,
              is_active: true,
              synced_at: nowIso,
            })
            .eq("id", existing.id);
          if (error) {
            report.errors.push(`Failed to update category ${cat.id}`);
            continue;
          }
          report.updated++;
        } else {
          // Still refresh synced_at so we can tell when we last saw it.
          const { error } = await supabase
            .from("categories")
            .update({ synced_at: nowIso })
            .eq("id", existing.id);
          if (error) {
            report.errors.push(`Failed to refresh category ${cat.id}`);
          }
        }
      } else {
        const { error } = await supabase.from("categories").insert({
          site,
          wp_category_id: cat.id,
          name: cat.name,
          is_active: true,
          synced_at: nowIso,
        });
        if (error) {
          report.errors.push(`Failed to create category ${cat.id}`);
          continue;
        }
        report.created++;
      }
    } catch {
      // Swallow per-row errors — one bad category doesn't kill the sync.
      report.errors.push(`Failed to process category ${cat.id}`);
      continue;
    }
  }

  // Deactivate anything we had but no longer see on WP.
  for (const [wpId, row] of existingBySiteId) {
    if (seenWpIds.has(wpId)) continue;
    if (!row.is_active) continue; // already inactive
    try {
      const { error } = await supabase
        .from("categories")
        .update({ is_active: false, synced_at: nowIso })
        .eq("id", row.id);
      if (error) {
        report.errors.push(`Failed to deactivate category ${wpId}`);
        continue;
      }
      report.deactivated++;
    } catch {
      report.errors.push(`Failed to deactivate category ${wpId}`);
      continue;
    }
  }

  return report;
}

// --------------------------------------------------------------------------
// Main: sync both sites
// --------------------------------------------------------------------------

export async function syncWpCategoriesForBothSites(): Promise<CategorySyncReport[]> {
  const reports: CategorySyncReport[] = [];
  reports.push(await syncWpCategoriesForSite("pl"));
  if (getWordPressSiteConfig("qb")) {
    reports.push(await syncWpCategoriesForSite("qb"));
  }
  return reports;
}
