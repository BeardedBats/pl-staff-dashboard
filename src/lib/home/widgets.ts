import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppRole, AppSite } from "@/lib/auth/current-user";
import type {
  ContentStatus,
  EditorStatus,
  GraphicStatus,
} from "@/lib/entries/queries";
import type { ManagerSignals } from "./manager-operations";

// --------------------------------------------------------------------------
// Shared widget row types
// --------------------------------------------------------------------------

export type HomeEntryCard = {
  id: string;
  title: string;
  site: AppSite;
  tier_name: string;
  publish_date: string | null;
  content_status: ContentStatus;
  editor_status: EditorStatus;
  priority: boolean;
  wp_post_url: string | null;
};

// --------------------------------------------------------------------------
// Writer: my active work
// --------------------------------------------------------------------------

/**
 * Entries where the user is an author and the content track is still live
 * (claimed, polishing). These are the things the writer is currently on the
 * hook for.
 */
export async function getMyActiveClaims(
  userId: string,
  limit = 10,
): Promise<HomeEntryCard[]> {
  const supabase = getSupabaseAdmin();
  const { data: authorRows } = await supabase
    .from("entry_authors")
    .select("entry_id")
    .eq("user_id", userId);

  const entryIds = ((authorRows ?? []) as Array<{ entry_id: string }>).map(
    (r) => r.entry_id,
  );
  if (entryIds.length === 0) return [];

  const { data } = await supabase
    .from("entries")
    .select(
      "id, title, site, priority, publish_date, content_status, editor_status, wp_post_url, tiers!inner(name)",
    )
    .in("id", entryIds)
    .in("content_status", ["claimed", "polishing"])
    .eq("is_archived", false)
    .eq("is_historical", false)
    .order("publish_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  return rowsToCards(data);
}

/**
 * Entries I've submitted that are now in the editor track waiting for
 * someone else. I can't move these along, but I want to see them.
 */
export async function getMySubmittedInFlight(
  userId: string,
  limit = 5,
): Promise<HomeEntryCard[]> {
  const supabase = getSupabaseAdmin();
  const { data: authorRows } = await supabase
    .from("entry_authors")
    .select("entry_id")
    .eq("user_id", userId);

  const entryIds = ((authorRows ?? []) as Array<{ entry_id: string }>).map(
    (r) => r.entry_id,
  );
  if (entryIds.length === 0) return [];

  const { data } = await supabase
    .from("entries")
    .select(
      "id, title, site, priority, publish_date, content_status, editor_status, wp_post_url, tiers!inner(name)",
    )
    .in("id", entryIds)
    .eq("content_status", "submitted")
    .in("editor_status", ["ready_for_edit", "edited"])
    .eq("is_archived", false)
    .eq("is_historical", false)
    .order("publish_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  return rowsToCards(data);
}

/**
 * Upcoming publish dates (next 14 days) where I'm a primary author and the
 * entry still needs work. Helps the writer plan their week.
 */
export async function getMyUpcomingDeadlines(
  userId: string,
  days = 14,
): Promise<HomeEntryCard[]> {
  const supabase = getSupabaseAdmin();
  const { data: authorRows } = await supabase
    .from("entry_authors")
    .select("entry_id")
    .eq("user_id", userId)
    .eq("role", "primary");

  const entryIds = ((authorRows ?? []) as Array<{ entry_id: string }>).map(
    (r) => r.entry_id,
  );
  if (entryIds.length === 0) return [];

  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(now.getDate() + days);

  const { data } = await supabase
    .from("entries")
    .select(
      "id, title, site, priority, publish_date, content_status, editor_status, wp_post_url, tiers!inner(name)",
    )
    .in("id", entryIds)
    .gte("publish_date", now.toISOString())
    .lte("publish_date", horizon.toISOString())
    .eq("is_archived", false)
    .eq("is_historical", false)
    .not("editor_status", "eq", "published")
    .order("publish_date", { ascending: true })
    .limit(10);

  return rowsToCards(data);
}

/**
 * Drafted entries authored by me that still need my approval before they
 * become active. Used to surface WP drafts the sync cron picked up.
 */
export async function getMyDraftsToApprove(
  userId: string,
): Promise<HomeEntryCard[]> {
  const supabase = getSupabaseAdmin();
  const { data: authorRows } = await supabase
    .from("entry_authors")
    .select("entry_id")
    .eq("user_id", userId);

  const entryIds = ((authorRows ?? []) as Array<{ entry_id: string }>).map(
    (r) => r.entry_id,
  );
  if (entryIds.length === 0) return [];

  const { data } = await supabase
    .from("entries")
    .select(
      "id, title, site, priority, publish_date, content_status, editor_status, wp_post_url, tiers!inner(name)",
    )
    .in("id", entryIds)
    .eq("is_drafted", true)
    .eq("is_archived", false)
    .eq("is_historical", false)
    .order("updated_at", { ascending: false })
    .limit(10);

  return rowsToCards(data);
}

// --------------------------------------------------------------------------
// Unclaimed slots — shown based on role fit
// --------------------------------------------------------------------------

/**
 * Open writer slots — entries with writer_needed status, excluding anything
 * the user can't fit (future: filter by tier eligibility). For now, we
 * simply cap by site fit.
 */
export async function getUnclaimedWriterSlots(
  userSite: AppSite,
  limit = 8,
): Promise<HomeEntryCard[]> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("entries")
    .select(
      "id, title, site, priority, publish_date, content_status, editor_status, wp_post_url, tiers!inner(name)",
    )
    .eq("content_status", "writer_needed")
    .eq("is_archived", false)
    .eq("is_drafted", false)
    .eq("is_historical", false)
    .order("priority", { ascending: false })
    .order("publish_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (userSite !== "both") q = q.in("site", [userSite, "both"]);
  const { data } = await q;
  return rowsToCards(data);
}

// --------------------------------------------------------------------------
// Editor widgets
// --------------------------------------------------------------------------

/**
 * Editing queue preview — entries ready for edit or in polishing, ordered
 * by how soon they need to ship.
 */
export async function getEditorQueuePreview(
  userSite: AppSite,
  limit = 8,
): Promise<HomeEntryCard[]> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("entries")
    .select(
      "id, title, site, priority, publish_date, content_status, editor_status, wp_post_url, tiers!inner(name)",
    )
    .in("editor_status", ["ready_for_edit"])
    .eq("is_archived", false)
    .eq("is_historical", false)
    .order("priority", { ascending: false })
    .order("publish_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (userSite !== "both") q = q.in("site", [userSite, "both"]);
  const { data } = await q;
  return rowsToCards(data);
}

/**
 * Entries where I am the assigned editor (entry_editors) and the track is
 * still live. These are "my edits in progress."
 */
export async function getMyActiveEdits(
  userId: string,
  limit = 10,
): Promise<HomeEntryCard[]> {
  const supabase = getSupabaseAdmin();
  const { data: editorRows } = await supabase
    .from("entry_editors")
    .select("entry_id")
    .eq("user_id", userId);

  const entryIds = ((editorRows ?? []) as Array<{ entry_id: string }>).map(
    (r) => r.entry_id,
  );
  if (entryIds.length === 0) return [];

  const { data } = await supabase
    .from("entries")
    .select(
      "id, title, site, priority, publish_date, content_status, editor_status, wp_post_url, tiers!inner(name)",
    )
    .in("id", entryIds)
    .in("editor_status", ["ready_for_edit", "edited"])
    .eq("is_archived", false)
    .eq("is_historical", false)
    .order("publish_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  return rowsToCards(data);
}

// --------------------------------------------------------------------------
// Graphics widgets
// --------------------------------------------------------------------------

export type HomeGraphicCard = {
  id: string;
  title: string;
  entry_id: string;
  entry_title: string;
  graphic_status: GraphicStatus;
  claimed_by_name: string | null;
  created_at: string;
};

/** Open graphic requests — "needed" or "flagged" (returned for revision). */
export async function getOpenGraphicRequests(
  userSite: AppSite,
  limit = 10,
): Promise<HomeGraphicCard[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("graphic_requests")
    .select(
      "id, title, created_at, graphic_status, entry_id, entries!inner(title, site), claimed_by",
    )
    .in("graphic_status", ["needed", "flagged"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (userSite !== "both") query = query.eq("entries.site", userSite);
  const { data } = await query;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    title: string;
    created_at: string;
    graphic_status: GraphicStatus;
    entry_id: string;
    entries: { title: string; site: AppSite };
    claimed_by: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    entry_id: r.entry_id,
    entry_title: r.entries.title,
    graphic_status: r.graphic_status,
    claimed_by_name: null,
    created_at: r.created_at,
  }));
}

/** Graphic requests I've claimed and haven't submitted yet. */
export async function getMyActiveGraphics(
  userId: string,
  limit = 10,
): Promise<HomeGraphicCard[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("graphic_requests")
    .select(
      "id, title, created_at, status, entry_id, entries!inner(title), claimed_by",
    )
    .eq("claimed_by", userId)
    .in("status", ["claimed", "flagged"])
    .order("created_at", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    title: string;
    created_at: string;
    status: GraphicStatus;
    entry_id: string;
    entries: { title: string };
    claimed_by: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    entry_id: r.entry_id,
    entry_title: r.entries.title,
    graphic_status: r.status,
    claimed_by_name: null,
    created_at: r.created_at,
  }));
}

// --------------------------------------------------------------------------
// EIC/Ops widgets
// --------------------------------------------------------------------------

export type PipelineHealth = {
  writerNeeded: number;
  claimed: number;
  submitted: number;
  readyForEdit: number;
  polishing: number;
  scheduled: number;
  publishedThisWeek: number;
  drafted: number;
  gateBlocked: number;
};

/**
 * High-level pipeline counts for the EIC / Operations overview card. One
 * query per bucket — PostgREST `count: "exact"` is cheap on indexed filters.
 */
export async function getPipelineHealth(
  userSite: AppSite,
): Promise<PipelineHealth> {
  const supabase = getSupabaseAdmin();
  const base = () => {
    let q = supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("is_drafted", false)
      .eq("is_historical", false);
    if (userSite !== "both") q = q.in("site", [userSite, "both"]);
    return q;
  };

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [
    writerNeeded,
    claimed,
    submitted,
    readyForEdit,
    polishing,
    scheduled,
    publishedThisWeek,
    drafted,
  ] = await Promise.all([
    base().eq("content_status", "writer_needed"),
    base().eq("content_status", "claimed"),
    base().eq("content_status", "submitted"),
    base().eq("editor_status", "ready_for_edit"),
    base().eq("content_status", "polishing"),
    base().eq("editor_status", "scheduled"),
    base().eq("editor_status", "published").gte("published_at", weekAgo.toISOString()),
    (() => {
      let q = supabase
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("is_drafted", true)
        .eq("is_archived", false)
        .eq("is_historical", false);
      if (userSite !== "both") q = q.in("site", [userSite, "both"]);
      return q;
    })(),
  ]);

  // Gate-blocked: content_status = submitted AND editor_status = edited but
  // not yet scheduled — could be waiting on graphics or just a missed gate.
  const { count: gateBlocked } = await (() => {
    let q = supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("is_drafted", false)
      .eq("is_historical", false)
      .eq("content_status", "submitted")
      .eq("editor_status", "edited");
    if (userSite !== "both") q = q.in("site", [userSite, "both"]);
    return q;
  })();

  return {
    writerNeeded: writerNeeded.count ?? 0,
    claimed: claimed.count ?? 0,
    submitted: submitted.count ?? 0,
    readyForEdit: readyForEdit.count ?? 0,
    polishing: polishing.count ?? 0,
    scheduled: scheduled.count ?? 0,
    publishedThisWeek: publishedThisWeek.count ?? 0,
    drafted: drafted.count ?? 0,
    gateBlocked: gateBlocked ?? 0,
  };
}

/** Site-scoped counts managers need for weekly risk triage. */
export async function getManagerSignals(
  userSite: AppSite,
): Promise<ManagerSignals> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const staleCutoff = new Date(now);
  staleCutoff.setDate(staleCutoff.getDate() - 7);

  const active = () => {
    let query = supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("is_drafted", false)
      .eq("is_historical", false)
      .neq("editor_status", "published");
    if (userSite !== "both") query = query.in("site", [userSite, "both"]);
    return query;
  };

  const [overdue, dueNextSevenDays, stale] = await Promise.all([
    active().lt("publish_date", now.toISOString()),
    active()
      .gte("publish_date", now.toISOString())
      .lte("publish_date", nextWeek.toISOString()),
    active()
      .in("content_status", ["claimed", "polishing"])
      .lt("updated_at", staleCutoff.toISOString()),
  ]);

  return {
    overdue: overdue.count ?? 0,
    dueNextSevenDays: dueNextSevenDays.count ?? 0,
    stale: stale.count ?? 0,
  };
}

export type WpSyncHealth = {
  pl: string | null;
  qb: string | null;
};

export async function getWpSyncHealth(userSite: AppSite): Promise<WpSyncHealth> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("global_settings")
    .select("key, value")
    .in("key", ["wp_last_sync_pl", "wp_last_sync_qb"]);

  const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
  const pl = rows.find((r) => r.key === "wp_last_sync_pl")?.value;
  const qb = rows.find((r) => r.key === "wp_last_sync_qb")?.value;
  return {
    pl: userSite !== "qb" && typeof pl === "string" ? pl : null,
    qb: userSite !== "pl" && typeof qb === "string" ? qb : null,
  };
}

/** 7-day pageview + revenue totals across both sources. */
export async function getAnalyticsMini(userSite: AppSite): Promise<{
  pageviews: number;
  revenue: number;
  daily: Array<{ date: string; pageviews: number; revenue: number }>;
}> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now);
  from.setDate(from.getDate() - 6);
  const fromIso = from.toISOString().slice(0, 10);

  let ga4Query = supabase
      .from("article_analytics")
      .select("date, pageviews, entries!inner(site)")
      .gte("date", fromIso)
      .lte("date", to);
  let raptiveQuery = supabase
      .from("raptive_revenue")
      .select("date, earnings, pageviews, entries!inner(site)")
      .gte("date", fromIso)
      .lte("date", to);
  if (userSite !== "both") {
    ga4Query = ga4Query.eq("entries.site", userSite);
    raptiveQuery = raptiveQuery.eq("entries.site", userSite);
  }
  const [ga4Res, raptiveRes] = await Promise.all([ga4Query, raptiveQuery]);

  const daily = new Map<
    string,
    { date: string; pageviews: number; revenue: number }
  >();
  let totalPV = 0;
  let totalRev = 0;

  for (const r of (ga4Res.data ?? []) as Array<{ date: string; pageviews: number }>) {
    const cur = daily.get(r.date) ?? {
      date: r.date,
      pageviews: 0,
      revenue: 0,
    };
    cur.pageviews += r.pageviews;
    daily.set(r.date, cur);
    totalPV += r.pageviews;
  }
  const ga4HasData = (ga4Res.data ?? []).length > 0;
  for (const r of (raptiveRes.data ?? []) as Array<{
    date: string;
    earnings: number;
    pageviews: number;
  }>) {
    const cur = daily.get(r.date) ?? {
      date: r.date,
      pageviews: 0,
      revenue: 0,
    };
    cur.revenue += Number(r.earnings) || 0;
    if (!ga4HasData) {
      cur.pageviews += r.pageviews;
      totalPV += r.pageviews;
    }
    daily.set(r.date, cur);
    totalRev += Number(r.earnings) || 0;
  }

  return {
    pageviews: totalPV,
    revenue: totalRev,
    daily: Array.from(daily.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}

/** Entries with no activity in 7+ days. Flagged for EIC stale content review. */
export async function getStaleEntries(
  userSite: AppSite,
  limit = 5,
): Promise<HomeEntryCard[]> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  let q = supabase
    .from("entries")
    .select(
      "id, title, site, priority, publish_date, content_status, editor_status, wp_post_url, tiers!inner(name)",
    )
    .eq("is_archived", false)
    .eq("is_drafted", false)
    .eq("is_historical", false)
    .in("content_status", ["claimed", "polishing"])
    .lt("updated_at", cutoff.toISOString())
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (userSite !== "both") q = q.in("site", [userSite, "both"]);
  const { data } = await q;
  return rowsToCards(data);
}

// --------------------------------------------------------------------------
// Internal: row → card normaliser
// --------------------------------------------------------------------------

function rowsToCards(data: unknown): HomeEntryCard[] {
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    title: string;
    site: AppSite;
    priority: boolean;
    publish_date: string | null;
    content_status: ContentStatus;
    editor_status: EditorStatus;
    wp_post_url: string | null;
    tiers: { name: string };
  }>;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    site: r.site,
    tier_name: r.tiers.name,
    publish_date: r.publish_date,
    content_status: r.content_status,
    editor_status: r.editor_status,
    priority: Boolean(r.priority),
    wp_post_url: r.wp_post_url,
  }));
}

// --------------------------------------------------------------------------
// Role helpers
// --------------------------------------------------------------------------

export function isWriterRole(roles: AppRole[]): boolean {
  return roles.some((r) =>
    ["writer", "editor", "manager", "admin", "eic", "operations"].includes(r),
  );
}
export function isEditorRole(roles: AppRole[]): boolean {
  return roles.some((r) =>
    ["editor", "manager", "admin", "eic", "operations"].includes(r),
  );
}
export function isGraphicsRole(roles: AppRole[]): boolean {
  return roles.includes("graphics");
}
export function isEicOrOps(roles: AppRole[]): boolean {
  return roles.some((r) => ["eic", "operations"].includes(r));
}
