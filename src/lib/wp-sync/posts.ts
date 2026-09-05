import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applyWpStateToEntry } from "@/lib/entries/status-transitions";
import {
  getWordPressSiteConfig,
  wordPressBasicAuth,
  type WpSiteKey,
} from "@/lib/wordpress/config";
import { fetchAllWpPages } from "@/lib/wp-sync/pagination";
import type { Json } from "@/types/database";

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

function compactBacklogPost(post: WpPost): WpPost {
  return {
    id: post.id,
    status: post.status,
    author: post.author,
    date_gmt: post.date_gmt,
    modified_gmt: post.modified_gmt,
    link: post.link,
    title: post.title,
  };
}

// --------------------------------------------------------------------------
// Watermark helpers
// --------------------------------------------------------------------------

function settingsKeyForSite(site: WpSiteKey): string {
  return site === "pl" ? "wp_last_sync_pl" : "wp_last_sync_qb";
}

async function readLastSyncIso(site: WpSiteKey): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("global_settings")
    .select("value")
    .eq("key", settingsKeyForSite(site))
    .maybeSingle();
  if (error) throw error;

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
  const { data: existing, error: readError } = await supabase
    .from("global_settings")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  if (readError) throw readError;

  if (existing?.id) {
    const { error } = await supabase
      .from("global_settings")
      .update({ value: iso, updated_at: new Date().toISOString() })
      .eq("id", existing.id as string);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("global_settings")
      .insert({ key, value: iso });
    if (error) throw error;
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
  const { data: tierA, error: tierAError } = await supabase
    .from("tiers")
    .select("id")
    .eq("name", "A")
    .maybeSingle();
  if (tierAError) throw tierAError;
  if (tierA?.id) return tierA.id as string;

  const { data: tierC, error: tierCError } = await supabase
    .from("tiers")
    .select("id")
    .eq("name", "C")
    .maybeSingle();
  if (tierCError) throw tierCError;
  return (tierC?.id as string | undefined) ?? null;
}

// --------------------------------------------------------------------------
// Main: sync one site
// --------------------------------------------------------------------------

export async function syncWpPostsForSite(
  site: WpSiteKey,
  systemUserId: string,
  recoverySince?: string,
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
  const modifiedAfter = recoverySince ?? await readLastSyncIso(site);

  const params = new URLSearchParams({
    modified_after: modifiedAfter,
    per_page: "100",
    status: "draft,pending,publish,future",
    context: "edit",
    orderby: "modified",
    order: "asc",
    _fields: "id,status,author,date_gmt,modified_gmt,link,title",
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
  const { data: backlogRows, error: backlogError } = await supabase
    .from("wp_sync_backlog")
    .select("wp_post_id,payload,last_seen_at")
    .eq("site", site)
    .order("last_seen_at", { ascending: true })
    .limit(25);
  if (backlogError) {
    report.errors.push({
      wpPostId: 0,
      message: "Failed to load the WordPress recovery backlog",
    });
    return report;
  }
  const postsById = new Map<number, WpPost>();
  for (const row of backlogRows ?? []) {
    if (fetched.rows.some((post) => post.id === row.wp_post_id)) continue;
    if (Date.parse(row.last_seen_at) > Date.now() - 24 * 60 * 60 * 1000) continue;
    // Never apply a cached draft over a post published since the backlog was recorded.
    const response = await fetch(`${config.url}/wp-json/wp/v2/posts/${row.wp_post_id}?context=edit&_fields=id,status,author,date_gmt,modified_gmt,link,title`, {
      headers: { Authorization: wordPressBasicAuth(config.appUsername, config.appPassword) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      report.errors.push({ wpPostId: row.wp_post_id, message: "Could not refresh backlog post" });
      continue;
    }
    postsById.set(row.wp_post_id, await response.json() as WpPost);
  }
  for (const post of fetched.rows) postsById.set(post.id, post);
  const posts = Array.from(postsById.values());

  report.postsFetched = fetched.rows.length;

  const defaultTierId = await findDefaultTierId();

  for (const post of posts) {
    try {
      // Look up an existing entry for this WP post on this site.
      const { data: existing, error: existingError } = await supabase
        .from("entries")
        .select("id")
        .eq("wp_post_id", post.id)
        .eq("site", site)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing?.id) {
        const { data: author, error: authorError } = await supabase.from("users")
          .select("id").eq("wp_user_id", post.author).in("wp_site", [site, "both"]).maybeSingle();
        if (authorError) throw authorError;
        if (author) {
          const { data: links, error } = await supabase.from("entry_authors")
            .select("user_id").eq("entry_id", existing.id).eq("role", "primary");
          if (error) throw error;
          if (!links?.length) {
            const { error: linkError } = await supabase.from("entry_authors").upsert({
              entry_id: existing.id, user_id: author.id, role: "primary",
            }, { onConflict: "entry_id,user_id", ignoreDuplicates: true });
            if (linkError) throw linkError;
          }
        }
        // Refresh the public permalink alongside the status mirror so that
        // migration 0010 can null out old admin URLs and trust the cron to
        // repopulate them with `post.link` on the next pass.
        const { error: refreshError } = await supabase
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
        if (refreshError) throw refreshError;

        // Update path — hand off to the status-transitions helper.
        await applyWpStateToEntry(existing.id as string, systemUserId, {
          status: post.status,
          modified: post.modified_gmt ? `${post.modified_gmt}Z` : null,
          date: post.date_gmt ? `${post.date_gmt}Z` : null,
        });
        if (!author) {
          const { error } = await supabase.rpc("queue_wp_sync_backlog", {
            p_site: site, p_wp_post_id: post.id, p_wp_author_id: post.author,
            p_payload: compactBacklogPost(post) as unknown as Json,
          });
          if (error) throw error;
          report.skippedNoMatchingUser++;
          report.entriesUpdated++;
          continue;
        }
        const { error: clearBacklogError } = await supabase
          .from("wp_sync_backlog")
          .delete()
          .eq("site", site)
          .eq("wp_post_id", post.id);
        if (clearBacklogError) throw clearBacklogError;
        report.entriesUpdated++;
        continue;
      }

      // A post can be published between polls. Capture it even before its author signs in.
      if (post.status === "publish" || post.status === "future") {
        if (!defaultTierId) throw new Error("No default tier configured");
        const { data: author, error: authorError } = await supabase.from("users")
          .select("id").eq("wp_user_id", post.author).in("wp_site", [site, "both"]).maybeSingle();
        if (authorError) throw authorError;
        const date = post.date_gmt ? `${post.date_gmt}Z` : null;
        const { data: captured, error: captureError } = await supabase.from("entries").insert({
          title: pickTitle(post), site, tier_id: defaultTierId,
          wp_post_id: post.id, wp_post_url: post.link, wp_status: post.status,
          wp_modified_at: post.modified_gmt ? `${post.modified_gmt}Z` : null,
          wp_sync_status: "synced", wp_last_synced_at: new Date().toISOString(),
          content_status: post.status === "publish" ? "published" : "submitted",
          editor_status: post.status === "publish" ? "published" : "scheduled",
          publish_date: date, publish_date_precision: date ? "exact" : "none",
          published_at: post.status === "publish" ? date : null,
          created_by: author?.id ?? systemUserId,
        }).select("id").single();
        if (captureError || !captured) throw captureError ?? new Error("Post capture failed");
        if (author) {
          const { error } = await supabase.from("entry_authors").upsert({
            entry_id: captured.id, user_id: author.id, role: "primary",
          }, { onConflict: "entry_id,user_id", ignoreDuplicates: true });
          if (error) throw error;
        } else {
          const { error } = await supabase.rpc("queue_wp_sync_backlog", {
            p_site: site, p_wp_post_id: post.id, p_wp_author_id: post.author,
            p_payload: compactBacklogPost(post) as unknown as Json,
          });
          if (error) throw error;
          report.skippedNoMatchingUser++;
        }
        report.entriesUpdated++;
        continue;
      }
      if (post.status !== "draft" && post.status !== "pending") {
        const { error: clearBacklogError } = await supabase
          .from("wp_sync_backlog")
          .delete()
          .eq("site", site)
          .eq("wp_post_id", post.id);
        if (clearBacklogError) throw clearBacklogError;
        report.skippedNotDraft++;
        continue;
      }

      const { data: dashboardUser, error: userError } = await supabase
        .from("users")
        .select("id, auto_approve_drafts")
        .eq("wp_user_id", post.author)
        .in("wp_site", [site, "both"])
        .maybeSingle();
      if (userError) throw userError;

      if (!dashboardUser?.id) {
        const { error: queueError } = await supabase.rpc(
          "queue_wp_sync_backlog",
          {
            p_site: site,
            p_wp_post_id: post.id,
            p_wp_author_id: post.author,
            p_payload: compactBacklogPost(post) as unknown as Json,
          },
        );
        if (queueError) throw queueError;
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

      const { data: insertedId, error: insertError } = await supabase.rpc(
        "create_wp_draft_entry",
        {
          p_title: title,
          p_site: site,
          p_tier_id: defaultTierId,
          p_wp_post_id: post.id,
          p_wp_post_url: publicUrl ?? "",
          p_wp_status: post.status,
          p_wp_modified_at: post.modified_gmt
            ? `${post.modified_gmt}Z`
            : "",
          p_user_id: dashboardUser.id as string,
          p_is_drafted: !autoApprove,
        },
      );

      if (insertError || !insertedId) {
        report.errors.push({
          wpPostId: post.id,
          message: "Failed to create dashboard entry",
        });
        continue;
      }

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
  if (report.errors.length === 0 && !recoverySince) {
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
