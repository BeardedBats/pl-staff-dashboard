import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applyWpStateToEntry, writeAuditRow } from "@/lib/entries/status-transitions";
import {
  getWordPressSiteConfig,
  wordPressBasicAuth,
  type WpSiteKey,
} from "@/lib/wordpress/config";
import { decideTitleSync } from "@/lib/wp-sync/conflicts";

/**
 * WordPress helpers for content entries.
 *
 * Scope for Step 4:
 *  - createWpDraftForEntry: when a claim is approved, POST a new draft to
 *    WP and store wp_post_id + wp_post_url on the entry.
 *  - refreshWpStatusForEntry: GET the current WP post and mirror its
 *    status onto the entry (scheduled / published transitions).
 *
 * The Step 10 cron will call refreshWpStatusForEntry for every entry with
 * a wp_post_id in bulk. For now it's per-entry on demand.
 */

// --------------------------------------------------------------------------
// Create WP draft on claim approval
// --------------------------------------------------------------------------

export async function createWpDraftForEntry(
  entryId: string,
  authorUserId: string,
): Promise<{ ok: true; wpPostId: number; wpPostUrl: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: entry } = await supabase
    .from("entries")
    .select("id, title, site, wp_post_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { ok: false, error: "Entry not found" };

  // Idempotent — don't create a second WP draft if one already exists.
  if (entry.wp_post_id) {
    const { data: existing } = await supabase
      .from("entries")
      .select("wp_post_id, wp_post_url")
      .eq("id", entryId)
      .maybeSingle();
    return {
      ok: true,
      wpPostId: existing?.wp_post_id as number,
      wpPostUrl: (existing?.wp_post_url as string) ?? "",
    };
  }

  // Resolve the author's WP user ID from the users table.
  const { data: authorRow } = await supabase
    .from("users")
    .select("wp_user_id")
    .eq("id", authorUserId)
    .maybeSingle();
  const wpAuthorId = (authorRow?.wp_user_id as number | null) ?? null;

  const site = (entry.site as WpSiteKey) ?? "pl";
  const config = getWordPressSiteConfig(site);
  if (!config) {
    return { ok: false, error: `WordPress ${site.toUpperCase()} not configured` };
  }

  const payload: Record<string, unknown> = {
    title: entry.title,
    status: "draft",
  };
  if (wpAuthorId) payload.author = wpAuthorId;

  let response: Response;
  try {
    response = await fetch(`${config.url}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: wordPressBasicAuth(
          config.appUsername,
          config.appPassword,
        ),
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach WordPress. Try again in a moment.",
    };
  }

  if (!response.ok) {
    return { ok: false, error: `WordPress request failed (${response.status})` };
  }

  const data = (await response.json()) as {
    id: number;
    link: string;
    status: string;
    modified_gmt?: string;
    date_gmt?: string;
  };

  // Public permalink — used by analytics joins (GA4 pagePath, Raptive
  // page_url) to match this entry to its traffic and revenue rows.
  const publicUrl = typeof data.link === "string" && data.link.length > 0
    ? data.link
    : null;

  await supabase
    .from("entries")
    .update({
      wp_post_id: data.id,
      wp_post_url: publicUrl,
      wp_status: data.status,
      wp_modified_at: data.modified_gmt ? `${data.modified_gmt}Z` : null,
      wp_sync_status: "synced",
      wp_last_synced_at: new Date().toISOString(),
      wp_last_sync_error: null,
      wp_synced_title: entry.title as string,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  await writeAuditRow(
    entryId,
    authorUserId,
    "field_edit",
    "wp_post_id",
    null,
    String(data.id),
  );

  return { ok: true, wpPostId: data.id, wpPostUrl: publicUrl ?? "" };
}

// --------------------------------------------------------------------------
// Refresh one entry's WP status
// --------------------------------------------------------------------------

export async function refreshWpStatusForEntry(
  entryId: string,
  systemUserId: string,
): Promise<
  | { ok: true; wpStatus: string | null; unchanged: boolean }
  | { ok: false; error: string }
> {
  const supabase = getSupabaseAdmin();

  const { data: entry } = await supabase
    .from("entries")
    .select("id, site, title, wp_post_id, wp_status, wp_synced_title")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { ok: false, error: "Entry not found" };
  if (!entry.wp_post_id) {
    return { ok: false, error: "Entry has no WP post yet" };
  }

  const site = (entry.site as WpSiteKey) ?? "pl";
  const config = getWordPressSiteConfig(site);
  if (!config) {
    return { ok: false, error: `WordPress ${site.toUpperCase()} not configured` };
  }

  let response: Response;
  try {
    response = await fetch(
      `${config.url}/wp-json/wp/v2/posts/${entry.wp_post_id}?context=edit`,
      {
        headers: {
          Authorization: wordPressBasicAuth(
            config.appUsername,
            config.appPassword,
          ),
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
  } catch {
    return {
      ok: false,
      error: "Could not reach WordPress. Try again in a moment.",
    };
  }

  if (response.status === 404) {
    // Post was deleted on WP — mark as trash.
    await supabase
      .from("entries")
      .update({ wp_status: "trash", updated_at: new Date().toISOString() })
      .eq("id", entryId);
    return { ok: true, wpStatus: "trash", unchanged: false };
  }
  if (!response.ok) {
    return { ok: false, error: `WP returned ${response.status}` };
  }

  const data = (await response.json()) as {
    id: number;
    status: string;
    link: string | null;
    date_gmt: string | null;
    modified_gmt: string | null;
    title: { rendered?: string; raw?: string } | string | null;
  };

  const incomingTitle =
    typeof data.title === "string"
      ? data.title
      : data.title?.raw || data.title?.rendered || "Untitled";
  const titleDecision = decideTitleSync({
    dashboardTitle: entry.title as string,
    lastSyncedTitle: (entry.wp_synced_title as string | null) ?? null,
    wordPressTitle: incomingTitle,
  });

  const oldWpStatus = (entry.wp_status as string | null) ?? null;
  const unchanged = oldWpStatus === data.status;

  // Keep wp_post_url in sync with the current public permalink — the link
  // changes when a post moves from draft (?p=N) to publish (clean slug).
  await supabase
    .from("entries")
    .update({
      ...(typeof data.link === "string" && data.link.length > 0
        ? { wp_post_url: data.link }
        : {}),
      wp_sync_status: titleDecision.status,
      wp_last_synced_at: new Date().toISOString(),
      wp_last_sync_error:
        titleDecision.status === "conflict"
          ? "Title changed in both the dashboard and WordPress"
          : null,
      wp_synced_title: titleDecision.nextBaseline,
    })
    .eq("id", entryId);

  await applyWpStateToEntry(entryId, systemUserId, {
    status: data.status,
    modified: data.modified_gmt ? `${data.modified_gmt}Z` : null,
    date: data.date_gmt ? `${data.date_gmt}Z` : null,
  });

  return { ok: true, wpStatus: data.status, unchanged };
}

export async function resolveWpTitleConflict(
  entryId: string,
  actorUserId: string,
  input: {
    resolution: "wordpress" | "dashboard";
    expectedWpModifiedAt: string;
  },
): Promise<
  | { ok: true; before: string; after: string; wpModifiedAt: string }
  | { ok: false; error: string; conflict?: boolean }
> {
  const supabase = getSupabaseAdmin();
  const { data: entry } = await supabase
    .from("entries")
    .select("id, site, title, wp_post_id, wp_sync_status")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || !entry.wp_post_id) return { ok: false, error: "Entry has no WP post" };
  if (entry.wp_sync_status !== "conflict") {
    return { ok: false, error: "Entry no longer has a WordPress conflict", conflict: true };
  }

  const site = entry.site as WpSiteKey;
  const config = getWordPressSiteConfig(site);
  if (!config) return { ok: false, error: `WordPress ${site.toUpperCase()} not configured` };
  const { data: lease, error: leaseError } = await supabase
    .from("entries")
    .update({
      wp_sync_status: "pending",
      wp_last_sync_error: "Conflict resolution in progress",
    })
    .eq("id", entryId)
    .eq("wp_sync_status", "conflict")
    .select("id")
    .maybeSingle();
  if (leaseError) return { ok: false, error: "Could not acquire conflict resolution" };
  if (!lease) {
    return {
      ok: false,
      error: "The conflict is already being resolved. Refresh before continuing.",
      conflict: true,
    };
  }
  async function failAfterLease(
    error: string,
    conflict = false,
  ): Promise<{ ok: false; error: string; conflict?: boolean }> {
    await supabase
      .from("entries")
      .update({
        wp_sync_status: conflict ? "conflict" : "error",
        wp_last_sync_error: error,
      })
      .eq("id", entryId)
      .eq("wp_sync_status", "pending");
    return { ok: false, error, ...(conflict ? { conflict: true } : {}) };
  }
  const endpoint = `${config.url}/wp-json/wp/v2/posts/${entry.wp_post_id}`;
  const headers = {
    Authorization: wordPressBasicAuth(config.appUsername, config.appPassword),
    Accept: "application/json",
  };

  let currentResponse: Response;
  try {
    currentResponse = await fetch(`${endpoint}?context=edit`, {
      headers,
      cache: "no-store",
    });
  } catch {
    return failAfterLease("Could not reach WordPress");
  }
  if (!currentResponse.ok) {
    return failAfterLease(`WordPress read failed (${currentResponse.status})`);
  }
  const current = (await currentResponse.json()) as {
    title: { raw?: string; rendered?: string } | string;
    modified_gmt: string;
  };
  const currentModified = `${current.modified_gmt}Z`;
  if (currentModified !== input.expectedWpModifiedAt) {
    return failAfterLease(
      "WordPress changed again. Refresh before resolving.",
      true,
    );
  }
  const wpTitle =
    typeof current.title === "string"
      ? current.title
      : current.title.raw || current.title.rendered || "Untitled";
  const dashboardTitle = entry.title as string;
  let chosenTitle = wpTitle;
  let finalModified = currentModified;

  if (input.resolution === "dashboard") {
    let updateResponse: Response;
    try {
      updateResponse = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title: dashboardTitle }),
        cache: "no-store",
      });
    } catch {
      return failAfterLease("Could not reach WordPress");
    }
    if (!updateResponse.ok) {
      return failAfterLease(`WordPress update failed (${updateResponse.status})`);
    }
    const updated = (await updateResponse.json()) as { modified_gmt?: string };
    chosenTitle = dashboardTitle;
    finalModified = updated.modified_gmt ? `${updated.modified_gmt}Z` : currentModified;
  }

  const { data: saved, error: updateError } = await supabase
    .from("entries")
    .update({
      ...(input.resolution === "wordpress" ? { title: chosenTitle } : {}),
      wp_synced_title: chosenTitle,
      wp_modified_at: finalModified,
      wp_sync_status: "synced",
      wp_last_synced_at: new Date().toISOString(),
      wp_last_sync_error: null,
    })
    .eq("id", entryId)
    .eq("wp_sync_status", "pending")
    .select("id")
    .maybeSingle();
  if (updateError) return failAfterLease("Could not save conflict resolution");
  if (!saved) {
    return {
      ok: false,
      error: "The conflict was resolved elsewhere. Refresh before continuing.",
      conflict: true,
    };
  }

  await writeAuditRow(
    entryId,
    actorUserId,
    "field_edit",
    "title",
    input.resolution === "wordpress" ? dashboardTitle : wpTitle,
    chosenTitle,
  );
  return {
    ok: true,
    before: input.resolution === "wordpress" ? dashboardTitle : wpTitle,
    after: chosenTitle,
    wpModifiedAt: finalModified,
  };
}
