import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applyWpStateToEntry } from "@/lib/entries/status-transitions";
import {
  getWordPressSiteConfig,
  wordPressBasicAuth,
  type WpSiteKey,
} from "@/lib/wordpress/config";
import { fetchAllWpPages } from "@/lib/wp-sync/pagination";

/**
 * WordPress → dashboard post sync.
 *
 * Polls the WP REST API for posts modified since the last sync watermark
 * stored in `global_settings` (`wp_last_sync_pl` / `wp_last_sync_qb`) and
 * reconciles each post with a dashboard entry:
 *
 *   - If an entry already exists (matched by wp_post_id + site), we hand
 *     off to `applyWpStateToEntry`, which mirrors draft/pending/future/
 *     publish transitions onto wp_status, editor_status, and published_at.
 *
 *   - If no entry exists and the WP author maps to a dashboard user,
 *     create a new "drafted" entry so the writer sees it in their queue.
 *     Authors with `auto_approve_drafts` skip the drafted flag — their
 *     work is visible to the whole team immediately.
 *
 *   - If the WP author doesn't map to any dashboard user, we skip the
 *     post entirely (it belongs to someone outside the dashboard's staff).
 *
 * Errors on individual posts are caught and reported — one bad post never
 * blocks the rest of the sync.
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type PostSyncReport = {
  site: WpSiteKey;
  postsFetched: number;
  entriesUpdated: number;
  draftedEntriesCreated: number;
  skippedNoMatchingUser: number;
  /** Published / scheduled posts skipped because they pre-date the dashboard. */
  skippedNotDraft: number;
  errors: Array<{ wpPostId: number; message: string }>;
};

type WpPost = {
  id: number;
  status: string;
  author: number;
  date_gmt: string | null;
  modified_gmt: string | null;
  link: string | null;
  title:
    | { rendered?: string; raw?: string }
    | string
    | null
    | undefined;
};

// --------------------------------------------------------------------------
// Watermark helpers
// --------------------------------------------------------------------------

function settingsKeyForSite(site: WpSiteKey): string {
  return site === "pl" ? "wp_last_sync_pl" : "wp_last_sync_qb";
}

async function readLastSyncIso(site: WpSiteKey): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("global_settings")
    .select("value")
    .eq("key", settingsKeyForSite(site))
    .maybeSingle();

  // `value` is JSONB: a JSON string like `"2026-04-15T12:00:00Z"`.
  const raw = (data?.value as unknown) ?? null;
  if (typeof raw === "string" && raw.length > 0) return raw;

  // Default: 7 days ago.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return sevenDaysAgo.toISOString();
}

async function writeLastSyncIso(site: WpSiteKey, iso: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const key = settingsKeyForSite(site);

  // Explicit select-then-insert-or-update — Supabase's upsert() requires
  // a UNIQUE constraint target, and we want to stay simple.
  const { data: existing } = await supabase
    .from("global_settings")
    .select("id")
    .eq("key", key)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("global_settings")
      .update({ value: iso, updated_at: new Date().toISOString() })
      .eq("id", existing.id as string);
  } else {
    await supabase.from("global_settings").insert({ key, value: iso });
  }
}

// --------------------------------------------------------------------------
// Core sync helpers
// --------------------------------------------------------------------------

function pickTitle(wp: WpPost): string {
  const t = wp.title;
  if (!t) return "Untitled";
  if (typeof t === "string") return t.length > 0 ? t : "Untitled";
  if (typeof t.rendered === "string" && t.rendered.length > 0) return t.rendered;
  if (typeof t.raw === "string" && t.raw.length > 0) return t.raw;
  return "Untitled";
}

async function findDefaultTierId(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  // Prefer "A" (Daily), fall back to "C" (Unscheduled).
  const { data: tierA } = await supabase
    .from("tiers")
    .select("id")
    .eq("name", "A")
    .maybeSingle();
  if (tierA?.id) return tierA.id as string;

  const { data: tierC } = await supabase
    .from("tiers")
    .select("id")
    .eq("name", "C")
    .maybeSingle();
  return (tierC?.id as string | undefined) ?? null;
}

async function seedChecklistForEntry(
  entryId: string,
  tierId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: items } = await supabase
    .from("checklist_items")
    .select("id")
    .eq("tier_id", tierId);
  const rows = ((items ?? []) as Array<{ id: string }>).map((item) => ({
    entry_id: entryId,
    checklist_item_id: item.id,
    is_completed: false,
  }));
  if (rows.length > 0) {
    await supabase.from("entry_checklist").insert(rows);
  }
}

// --------------------------------------------------------------------------
// Main: sync one site
// --------------------------------------------------------------------------

export async function syncWpPostsForSite(
  site: WpSiteKey,
  systemUserId: string,
): Promise<PostSyncReport> {
  const report: PostSyncReport = {
    site,
    postsFetched: 0,
    entriesUpdated: 0,
    draftedEntriesCreated: 0,
    skippedNoMatchingUser: 0,
    skippedNotDraft: 0,
    errors: [],
  };

  const config = getWordPressSiteConfig(site);
  if (!config) {
    report.errors.push({
      wpPostId: 0,
      message: `WordPress ${site.toUpperCase()} not configured`,
    });
    return report;
  }

  const supabase = getSupabaseAdmin();

  // Mark the "started at" time BEFORE we fetch so that any changes made
  // during the sync are still caught next time.
  const syncStartedAt = new Date().toISOString();
  const modifiedAfter = await readLastSyncIso(site);

  const params = new URLSearchParams({
    modified_after: modifiedAfter,
    per_page: "100",
    status: "draft,pending,publish,future",
    context: "edit",
    orderby: "modified",
    order: "asc",
  });
  const fetched = await fetchAllWpPages<WpPost>({
    urlForPage: (page) => {
      params.set("page", String(page));
      return `${config.url}/wp-json/wp/v2/posts?${params.toString()}`;
    },
    headers: {
      Authorization: wordPressBasicAuth(
        config.appUsername,
        config.appPassword,
      ),
      Accept: "application/json",
    },
  });
  if (!fetched.ok) {
    await supabase
      .from("entries")
      .update({
        wp_sync_status: "stale",
        wp_last_sync_error: fetched.error.slice(0, 500),
      })
      .eq("site", site)
      .not("wp_post_id", "is", null);
    report.errors.push({ wpPostId: 0, message: fetched.error });
    return report;
  }
  const posts = fetched.rows;

  report.postsFetched = posts.length;

  const defaultTierId = await findDefaultTierId();

  for (const post of posts) {
    try {
      // Look up an existing entry for this WP post on this site.
      const { data: existing } = await supabase
        .from("entries")
        .select("id")
        .eq("wp_post_id", post.id)
        .eq("site", site)
        .maybeSingle();

      if (existing?.id) {
        // Refresh the public permalink alongside the status mirror so that
        // migration 0010 can null out old admin URLs and trust the cron to
        // repopulate them with `post.link` on the next pass.
        await supabase
          .from("entries")
          .update({
            ...(typeof post.link === "string" && post.link.length > 0
              ? { wp_post_url: post.link }
              : {}),
            wp_sync_status: "synced",
            wp_last_synced_at: new Date().toISOString(),
            wp_last_sync_error: null,
          })
          .eq("id", existing.id as string);

        // Update path — hand off to the status-transitions helper.
        await applyWpStateToEntry(existing.id as string, systemUserId, {
          status: post.status,
          modified: post.modified_gmt ? `${post.modified_gmt}Z` : null,
          date: post.date_gmt ? `${post.date_gmt}Z` : null,
        });
        report.entriesUpdated++;
        continue;
      }

      // Create path — only for draft/pending posts. Published and scheduled
      // posts that don't already have a dashboard entry pre-date the
      // dashboard's tracking and shouldn't auto-create backdated entries.
      // This keeps the smoke test from accidentally pulling thousands of
      // old pitcherlist.com articles into the dashboard.
      if (post.status !== "draft" && post.status !== "pending") {
        report.skippedNotDraft++;
        continue;
      }

      const { data: dashboardUser } = await supabase
        .from("users")
        .select("id, auto_approve_drafts")
        .eq("wp_user_id", post.author)
        .maybeSingle();

      if (!dashboardUser?.id) {
        report.skippedNoMatchingUser++;
        continue;
      }

      if (!defaultTierId) {
        report.errors.push({
          wpPostId: post.id,
          message: "No default tier found (need 'A' or 'C' in tiers table)",
        });
        continue;
      }

      const title = pickTitle(post);
      // Store the public permalink (post.link) so analytics joins on
      // wp_post_url can match GA4 pagePath and Raptive page_url. The
      // wp-admin edit URL is reachable via wp_post_id when needed.
      const publicUrl = typeof post.link === "string" && post.link.length > 0
        ? post.link
        : null;
      const autoApprove = Boolean(
        (dashboardUser as { auto_approve_drafts?: boolean }).auto_approve_drafts,
      );

      const { data: inserted, error: insertError } = await supabase
        .from("entries")
        .insert({
          title,
          site,
          tier_id: defaultTierId,
          wp_post_id: post.id,
          wp_post_url: publicUrl,
          wp_status: post.status,
          wp_modified_at: post.modified_gmt ? `${post.modified_gmt}Z` : null,
          wp_sync_status: "synced",
          wp_last_synced_at: new Date().toISOString(),
          wp_last_sync_error: null,
          content_status: "claimed",
          editor_status: "none",
          created_by: dashboardUser.id as string,
          is_drafted: !autoApprove,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        report.errors.push({
          wpPostId: post.id,
          message: "Failed to create dashboard entry",
        });
        continue;
      }

      const newEntryId = inserted.id as string;

      // Seed entry_authors with the mapped dashboard user as primary.
      await supabase.from("entry_authors").insert({
        entry_id: newEntryId,
        user_id: dashboardUser.id as string,
        role: "primary",
      });

      // Seed the tier's checklist items.
      await seedChecklistForEntry(newEntryId, defaultTierId);

      // Audit row.
      await supabase.from("audit_log").insert({
        entry_id: newEntryId,
        user_id: dashboardUser.id as string,
        action: "created",
        new_value: "auto-picked up from WordPress draft",
      });

      report.draftedEntriesCreated++;
    } catch {
      report.errors.push({
        wpPostId: post.id,
        message: "Failed to process WordPress post",
      });
    }
  }

  // Any failed row stays inside the next retry window. Successful rows are
  // safe to see again because matching is keyed by (site, wp_post_id).
  if (report.errors.length === 0) {
    try {
      await writeLastSyncIso(site, syncStartedAt);
    } catch {
      report.errors.push({
        wpPostId: 0,
        message: "Failed to update the WordPress sync watermark",
      });
    }
  }

  return report;
}

// --------------------------------------------------------------------------
// Main: sync both sites
// --------------------------------------------------------------------------

export async function syncWpPostsForBothSites(
  systemUserId: string,
): Promise<PostSyncReport[]> {
  const reports: PostSyncReport[] = [];
  reports.push(await syncWpPostsForSite("pl", systemUserId));
  if (getWordPressSiteConfig("qb")) {
    reports.push(await syncWpPostsForSite("qb", systemUserId));
  }
  return reports;
}
