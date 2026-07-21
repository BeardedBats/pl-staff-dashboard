import "server-only";

import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applyWpStateToEntry, writeAuditRow } from "@/lib/entries/status-transitions";
import type { WpSiteKey } from "@/lib/auth/wordpress";

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
  const config = getSiteConfig(site);
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
        Authorization: basicAuth(config.appUsername, config.appPassword),
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
    .select("id, site, wp_post_id, wp_status")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { ok: false, error: "Entry not found" };
  if (!entry.wp_post_id) {
    return { ok: false, error: "Entry has no WP post yet" };
  }

  const site = (entry.site as WpSiteKey) ?? "pl";
  const config = getSiteConfig(site);
  if (!config) {
    return { ok: false, error: `WordPress ${site.toUpperCase()} not configured` };
  }

  let response: Response;
  try {
    response = await fetch(
      `${config.url}/wp-json/wp/v2/posts/${entry.wp_post_id}?context=edit`,
      {
        headers: {
          Authorization: basicAuth(config.appUsername, config.appPassword),
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
  };

  const oldWpStatus = (entry.wp_status as string | null) ?? null;
  const unchanged = oldWpStatus === data.status;

  // Keep wp_post_url in sync with the current public permalink — the link
  // changes when a post moves from draft (?p=N) to publish (clean slug).
  if (typeof data.link === "string" && data.link.length > 0) {
    await supabase
      .from("entries")
      .update({ wp_post_url: data.link })
      .eq("id", entryId);
  }

  await applyWpStateToEntry(entryId, systemUserId, {
    status: data.status,
    modified: data.modified_gmt ? `${data.modified_gmt}Z` : null,
    date: data.date_gmt ? `${data.date_gmt}Z` : null,
  });

  return { ok: true, wpStatus: data.status, unchanged };
}
