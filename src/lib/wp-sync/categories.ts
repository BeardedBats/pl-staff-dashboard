import "server-only";

import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WpSiteKey } from "@/lib/auth/wordpress";

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
// Site config + auth (duplicated from lib/auth/wordpress.ts internals)
// --------------------------------------------------------------------------

type SiteConfig = {
  url: string;
  appUsername: string;
  appPassword: string;
};

function getSiteConfig(site: WpSiteKey): SiteConfig | null {
  if (site === "pl") {
    if (!env.WP_PL_URL || !env.WP_PL_USERNAME || !env.WP_PL_APP_PASSWORD) return null;
    return {
      url: env.WP_PL_URL.replace(/\/$/, ""),
      appUsername: env.WP_PL_USERNAME,
      appPassword: env.WP_PL_APP_PASSWORD,
    };
  }
  if (!env.WP_QB_URL || !env.WP_QB_USERNAME || !env.WP_QB_APP_PASSWORD) return null;
  return {
    url: env.WP_QB_URL.replace(/\/$/, ""),
    appUsername: env.WP_QB_USERNAME,
    appPassword: env.WP_QB_APP_PASSWORD,
  };
}

function basicAuth(username: string, password: string): string {
  const normalized = password.replace(/\s+/g, "");
  return "Basic " + Buffer.from(`${username}:${normalized}`).toString("base64");
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type CategorySyncReport = {
  site: WpSiteKey;
  fetched: number;
  created: number;
  updated: number;
  deactivated: number;
};

type WpCategory = {
  id: number;
  name: string;
};

// --------------------------------------------------------------------------
// Paginated fetch
// --------------------------------------------------------------------------

async function fetchAllCategories(
  config: SiteConfig,
): Promise<WpCategory[]> {
  const all: WpCategory[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      per_page: "100",
      hide_empty: "false",
      page: String(page),
    });
    const response = await fetch(
      `${config.url}/wp-json/wp/v2/categories?${params.toString()}`,
      {
        headers: {
          Authorization: basicAuth(config.appUsername, config.appPassword),
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      // Page-1 failure bubbles up; downstream errors for pages 2+ stop
      // the loop but keep whatever we've collected so far.
      if (page === 1) {
        throw new Error(`WP returned ${response.status}`);
      }
      break;
    }

    const totalHeader = response.headers.get("x-wp-totalpages");
    if (totalHeader) {
      const parsed = parseInt(totalHeader, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        totalPages = parsed;
      }
    }

    const rows = (await response.json()) as WpCategory[];
    for (const row of rows) all.push(row);

    page++;
  } while (page <= totalPages);

  return all;
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
  };

  const config = getSiteConfig(site);
  if (!config) return report;

  let wpCategories: WpCategory[];
  try {
    wpCategories = await fetchAllCategories(config);
  } catch {
    return report;
  }

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
          await supabase
            .from("categories")
            .update({
              name: cat.name,
              is_active: true,
              synced_at: nowIso,
            })
            .eq("id", existing.id);
          report.updated++;
        } else {
          // Still refresh synced_at so we can tell when we last saw it.
          await supabase
            .from("categories")
            .update({ synced_at: nowIso })
            .eq("id", existing.id);
        }
      } else {
        await supabase.from("categories").insert({
          site,
          wp_category_id: cat.id,
          name: cat.name,
          is_active: true,
          synced_at: nowIso,
        });
        report.created++;
      }
    } catch {
      // Swallow per-row errors — one bad category doesn't kill the sync.
      continue;
    }
  }

  // Deactivate anything we had but no longer see on WP.
  for (const [wpId, row] of existingBySiteId) {
    if (seenWpIds.has(wpId)) continue;
    if (!row.is_active) continue; // already inactive
    try {
      await supabase
        .from("categories")
        .update({ is_active: false, synced_at: nowIso })
        .eq("id", row.id);
      report.deactivated++;
    } catch {
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
  if (env.WP_QB_URL) {
    reports.push(await syncWpCategoriesForSite("qb"));
  }
  return reports;
}
