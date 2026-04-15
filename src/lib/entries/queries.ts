import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppRole, AppSite } from "@/lib/auth/current-user";

// --------------------------------------------------------------------------
// Shared shapes
// --------------------------------------------------------------------------

export type ContentStatus =
  | "writer_needed"
  | "claim_requested"
  | "claimed"
  | "submitted"
  | "polishing";

export type EditorStatus =
  | "none"
  | "ready_for_edit"
  | "edited"
  | "scheduled"
  | "published";

export type GraphicStatus = "needed" | "claimed" | "submitted" | "flagged";

/** Precision of a publish date — some recurring slots don't have an exact time yet. */
export type PublishDatePrecision = "exact" | "loose_date" | "loose_time" | "none";

export type EntryAuthor = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: "primary" | "co_author";
};

export type EntryEditor = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
};

export type EntryTier = {
  id: string;
  name: string;
  label: string;
  sort_order: number;
};

export type EntryCategory = {
  id: string;
  name: string;
  site: AppSite;
};

export type EntrySeries = {
  id: string;
  title_pattern: string;
};

export type EntryGraphicSummary = {
  id: string;
  title: string;
  graphic_status: GraphicStatus;
};

export type EntrySummary = {
  id: string;
  title: string;
  description: string | null;
  site: AppSite;
  tier: EntryTier;
  priority: boolean;
  publish_date: string | null;
  publish_date_precision: PublishDatePrecision;
  content_status: ContentStatus;
  editor_status: EditorStatus;
  is_archived: boolean;
  archive_reason: string | null;
  wp_post_id: number | null;
  wp_post_url: string | null;
  word_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  category: EntryCategory | null;
  series: EntrySeries | null;
  authors: EntryAuthor[];
  editors: EntryEditor[];
  graphics: EntryGraphicSummary[];
  checklist_total: number;
  checklist_completed: number;
};

export type ListEntriesFilters = {
  search?: string;
  site?: AppSite;
  tierId?: string;
  categoryId?: string;
  contentStatus?: ContentStatus;
  editorStatus?: EditorStatus;
  priority?: boolean;
  authorId?: string;
  includeArchived?: boolean;
  dateFrom?: string; // ISO
  dateTo?: string;   // ISO
  sortBy?: "publish_date" | "created_at" | "updated_at" | "title";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type ListEntriesResult = {
  entries: EntrySummary[];
  totalCount: number;
};

// --------------------------------------------------------------------------
// List entries
// --------------------------------------------------------------------------

/**
 * List entries with filters, sorting, and pagination.
 *
 * Like the users query, we batch-fetch joined data and stitch in app code.
 * The alternative — a single fat PostgREST query with nested selects — tends
 * to time out in Supabase as the entries table grows.
 */
export async function listEntries(
  filters: ListEntriesFilters = {},
): Promise<ListEntriesResult> {
  const supabase = getSupabaseAdmin();

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const sortBy = filters.sortBy ?? "publish_date";
  const sortDir = filters.sortDir ?? "asc";

  let query = supabase
    .from("entries")
    .select(
      "id, title, description, site, tier_id, priority, publish_date, publish_date_precision, content_status, editor_status, is_archived, archive_reason, wp_post_id, wp_post_url, word_count, created_by, created_at, updated_at, category_id, series_id",
      { count: "exact" },
    );

  // Filter: archived or not.
  if (!filters.includeArchived) {
    query = query.eq("is_archived", false);
  }

  if (filters.search) {
    const term = filters.search.replace(/%/g, "").trim();
    if (term.length > 0) {
      query = query.ilike("title", `%${term}%`);
    }
  }

  if (filters.site && filters.site !== "both") {
    query = query.eq("site", filters.site);
  }
  if (filters.tierId) query = query.eq("tier_id", filters.tierId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.contentStatus) query = query.eq("content_status", filters.contentStatus);
  if (filters.editorStatus) query = query.eq("editor_status", filters.editorStatus);
  if (typeof filters.priority === "boolean") query = query.eq("priority", filters.priority);
  if (filters.dateFrom) query = query.gte("publish_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("publish_date", filters.dateTo);

  query = query
    .order(sortBy, { ascending: sortDir === "asc", nullsFirst: false })
    .range(offset, offset + limit - 1);

  const { data: entryRows, error: entryError, count } = await query;
  if (entryError || !entryRows) {
    return { entries: [], totalCount: 0 };
  }
  if (entryRows.length === 0) {
    return { entries: [], totalCount: count ?? 0 };
  }

  const entryIds = entryRows.map((e) => e.id as string);
  const tierIds = Array.from(new Set(entryRows.map((e) => e.tier_id as string)));
  const categoryIds = Array.from(
    new Set(
      entryRows
        .map((e) => e.category_id as string | null)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const seriesIds = Array.from(
    new Set(
      entryRows
        .map((e) => e.series_id as string | null)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  // Fan-out joins in parallel.
  const [tierMap, categoryMap, seriesMap, authorsByEntry, editorsByEntry, graphicsByEntry, checklistCounts] =
    await Promise.all([
      loadTiers(tierIds),
      loadCategories(categoryIds),
      loadSeries(seriesIds),
      loadAuthors(entryIds),
      loadEditors(entryIds),
      loadGraphicSummaries(entryIds),
      loadChecklistCounts(entryIds),
    ]);

  // Filter: by author (post-filter since it needs the join).
  let entries: EntrySummary[] = entryRows.map((row) =>
    buildEntrySummary(row, {
      tierMap,
      categoryMap,
      seriesMap,
      authorsByEntry,
      editorsByEntry,
      graphicsByEntry,
      checklistCounts,
    }),
  );

  if (filters.authorId) {
    entries = entries.filter((e) =>
      e.authors.some((a) => a.user_id === filters.authorId),
    );
  }

  return { entries, totalCount: count ?? entries.length };
}

// --------------------------------------------------------------------------
// Detail view
// --------------------------------------------------------------------------

export type EntryDetail = EntrySummary & {
  creator: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  checklist: Array<{
    id: string;
    label: string;
    sort_order: number;
    is_required: boolean;
    is_completed: boolean;
    completed_by: string | null;
    completed_at: string | null;
  }>;
  graphic_requests: Array<{
    id: string;
    title: string;
    description: string | null;
    urgency_date: string | null;
    graphic_status: GraphicStatus;
    claimed_by: string | null;
    file_url: string | null;
    flag_reason: string | null;
    created_at: string;
  }>;
};

export async function getEntryById(id: string): Promise<EntryDetail | null> {
  const supabase = getSupabaseAdmin();

  const { data: row, error } = await supabase
    .from("entries")
    .select(
      "id, title, description, site, tier_id, priority, publish_date, publish_date_precision, content_status, editor_status, is_archived, archive_reason, wp_post_id, wp_post_url, word_count, created_by, created_at, updated_at, category_id, series_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !row) return null;

  const [
    tierMap,
    categoryMap,
    seriesMap,
    authorsByEntry,
    editorsByEntry,
    graphicsByEntry,
    checklistCounts,
    creator,
    checklist,
    graphicRequests,
  ] = await Promise.all([
    loadTiers([row.tier_id as string]),
    loadCategories(row.category_id ? [row.category_id as string] : []),
    loadSeries(row.series_id ? [row.series_id as string] : []),
    loadAuthors([id]),
    loadEditors([id]),
    loadGraphicSummaries([id]),
    loadChecklistCounts([id]),
    loadCreator(row.created_by as string),
    loadChecklist(id),
    loadFullGraphicRequests(id),
  ]);

  const summary = buildEntrySummary(row, {
    tierMap,
    categoryMap,
    seriesMap,
    authorsByEntry,
    editorsByEntry,
    graphicsByEntry,
    checklistCounts,
  });

  return {
    ...summary,
    creator,
    checklist,
    graphic_requests: graphicRequests,
  };
}

// --------------------------------------------------------------------------
// Helpers — each is a focused Supabase query
// --------------------------------------------------------------------------

type EntryRow = {
  id: string;
  title: string;
  description: string | null;
  site: AppSite;
  tier_id: string;
  priority: boolean;
  publish_date: string | null;
  publish_date_precision: PublishDatePrecision;
  content_status: ContentStatus;
  editor_status: EditorStatus;
  is_archived: boolean;
  archive_reason: string | null;
  wp_post_id: number | null;
  wp_post_url: string | null;
  word_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  category_id: string | null;
  series_id: string | null;
};

type Maps = {
  tierMap: Map<string, EntryTier>;
  categoryMap: Map<string, EntryCategory>;
  seriesMap: Map<string, EntrySeries>;
  authorsByEntry: Map<string, EntryAuthor[]>;
  editorsByEntry: Map<string, EntryEditor[]>;
  graphicsByEntry: Map<string, EntryGraphicSummary[]>;
  checklistCounts: Map<string, { total: number; completed: number }>;
};

function buildEntrySummary(row: unknown, maps: Maps): EntrySummary {
  const r = row as EntryRow;
  const tier = maps.tierMap.get(r.tier_id);
  const category = r.category_id ? maps.categoryMap.get(r.category_id) ?? null : null;
  const series = r.series_id ? maps.seriesMap.get(r.series_id) ?? null : null;
  const checklist = maps.checklistCounts.get(r.id) ?? { total: 0, completed: 0 };

  return {
    id: r.id,
    title: r.title,
    description: r.description,
    site: r.site,
    tier: tier ?? { id: r.tier_id, name: "?", label: "Unknown", sort_order: 99 },
    priority: Boolean(r.priority),
    publish_date: r.publish_date,
    publish_date_precision: r.publish_date_precision,
    content_status: r.content_status,
    editor_status: r.editor_status,
    is_archived: Boolean(r.is_archived),
    archive_reason: r.archive_reason,
    wp_post_id: r.wp_post_id,
    wp_post_url: r.wp_post_url,
    word_count: r.word_count ?? 0,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    category,
    series,
    authors: maps.authorsByEntry.get(r.id) ?? [],
    editors: maps.editorsByEntry.get(r.id) ?? [],
    graphics: maps.graphicsByEntry.get(r.id) ?? [],
    checklist_total: checklist.total,
    checklist_completed: checklist.completed,
  };
}

async function loadTiers(ids: string[]): Promise<Map<string, EntryTier>> {
  const map = new Map<string, EntryTier>();
  if (ids.length === 0) return map;
  const { data } = await getSupabaseAdmin()
    .from("tiers")
    .select("id, name, label, sort_order")
    .in("id", ids);
  for (const t of (data ?? []) as Array<{
    id: string;
    name: string;
    label: string;
    sort_order: number;
  }>) {
    map.set(t.id, t);
  }
  return map;
}

async function loadCategories(
  ids: string[],
): Promise<Map<string, EntryCategory>> {
  const map = new Map<string, EntryCategory>();
  if (ids.length === 0) return map;
  const { data } = await getSupabaseAdmin()
    .from("categories")
    .select("id, name, site")
    .in("id", ids);
  for (const c of (data ?? []) as Array<{
    id: string;
    name: string;
    site: AppSite;
  }>) {
    map.set(c.id, c);
  }
  return map;
}

async function loadSeries(ids: string[]): Promise<Map<string, EntrySeries>> {
  const map = new Map<string, EntrySeries>();
  if (ids.length === 0) return map;
  const { data } = await getSupabaseAdmin()
    .from("recurring_templates")
    .select("id, title_pattern")
    .in("id", ids);
  for (const s of (data ?? []) as Array<{ id: string; title_pattern: string }>) {
    map.set(s.id, s);
  }
  return map;
}

async function loadAuthors(
  entryIds: string[],
): Promise<Map<string, EntryAuthor[]>> {
  const map = new Map<string, EntryAuthor[]>();
  if (entryIds.length === 0) return map;
  const { data } = await getSupabaseAdmin()
    .from("entry_authors")
    .select("entry_id, role, users!inner(id, display_name, avatar_url)")
    .in("entry_id", entryIds);
  for (const row of (data ?? []) as Array<{
    entry_id: string;
    role: "primary" | "co_author";
    users: { id: string; display_name: string; avatar_url: string | null };
  }>) {
    const list = map.get(row.entry_id) ?? [];
    list.push({
      user_id: row.users.id,
      display_name: row.users.display_name,
      avatar_url: row.users.avatar_url,
      role: row.role,
    });
    map.set(row.entry_id, list);
  }
  return map;
}

async function loadEditors(
  entryIds: string[],
): Promise<Map<string, EntryEditor[]>> {
  const map = new Map<string, EntryEditor[]>();
  if (entryIds.length === 0) return map;
  const { data } = await getSupabaseAdmin()
    .from("entry_editors")
    .select("entry_id, users!inner(id, display_name, avatar_url)")
    .in("entry_id", entryIds);
  for (const row of (data ?? []) as Array<{
    entry_id: string;
    users: { id: string; display_name: string; avatar_url: string | null };
  }>) {
    const list = map.get(row.entry_id) ?? [];
    list.push({
      user_id: row.users.id,
      display_name: row.users.display_name,
      avatar_url: row.users.avatar_url,
    });
    map.set(row.entry_id, list);
  }
  return map;
}

async function loadGraphicSummaries(
  entryIds: string[],
): Promise<Map<string, EntryGraphicSummary[]>> {
  const map = new Map<string, EntryGraphicSummary[]>();
  if (entryIds.length === 0) return map;
  const { data } = await getSupabaseAdmin()
    .from("graphic_requests")
    .select("id, entry_id, title, graphic_status")
    .in("entry_id", entryIds);
  for (const row of (data ?? []) as Array<{
    id: string;
    entry_id: string;
    title: string;
    graphic_status: GraphicStatus;
  }>) {
    const list = map.get(row.entry_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      graphic_status: row.graphic_status,
    });
    map.set(row.entry_id, list);
  }
  return map;
}

async function loadChecklistCounts(
  entryIds: string[],
): Promise<Map<string, { total: number; completed: number }>> {
  const map = new Map<string, { total: number; completed: number }>();
  if (entryIds.length === 0) return map;
  const { data } = await getSupabaseAdmin()
    .from("entry_checklist")
    .select("entry_id, is_completed")
    .in("entry_id", entryIds);
  for (const row of (data ?? []) as Array<{
    entry_id: string;
    is_completed: boolean;
  }>) {
    const current = map.get(row.entry_id) ?? { total: 0, completed: 0 };
    current.total += 1;
    if (row.is_completed) current.completed += 1;
    map.set(row.entry_id, current);
  }
  return map;
}

async function loadCreator(userId: string) {
  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("id, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    display_name: data.display_name as string,
    avatar_url: (data.avatar_url as string | null) ?? null,
  };
}

async function loadChecklist(entryId: string) {
  const { data } = await getSupabaseAdmin()
    .from("entry_checklist")
    .select(
      "id, is_completed, completed_by, completed_at, checklist_items!inner(id, label, sort_order, is_required)",
    )
    .eq("entry_id", entryId)
    .order("checklist_items(sort_order)");

  return ((data ?? []) as Array<{
    id: string;
    is_completed: boolean;
    completed_by: string | null;
    completed_at: string | null;
    checklist_items: {
      id: string;
      label: string;
      sort_order: number;
      is_required: boolean;
    };
  }>).map((row) => ({
    id: row.id,
    label: row.checklist_items.label,
    sort_order: row.checklist_items.sort_order,
    is_required: row.checklist_items.is_required,
    is_completed: Boolean(row.is_completed),
    completed_by: row.completed_by,
    completed_at: row.completed_at,
  }));
}

async function loadFullGraphicRequests(entryId: string) {
  const { data } = await getSupabaseAdmin()
    .from("graphic_requests")
    .select(
      "id, title, description, urgency_date, graphic_status, claimed_by, file_url, flag_reason, created_at",
    )
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true });

  return ((data ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    urgency_date: string | null;
    graphic_status: GraphicStatus;
    claimed_by: string | null;
    file_url: string | null;
    flag_reason: string | null;
    created_at: string;
  }>).map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    urgency_date: g.urgency_date,
    graphic_status: g.graphic_status,
    claimed_by: g.claimed_by,
    file_url: g.file_url,
    flag_reason: g.flag_reason,
    created_at: g.created_at,
  }));
}

// --------------------------------------------------------------------------
// Tier + Category helpers (used by the Create Entry modal and filters)
// --------------------------------------------------------------------------

export async function listTiers(): Promise<EntryTier[]> {
  const { data } = await getSupabaseAdmin()
    .from("tiers")
    .select("id, name, label, sort_order")
    .order("sort_order", { ascending: true });
  return (data ?? []) as EntryTier[];
}

export async function listCategories(
  site?: AppSite,
): Promise<EntryCategory[]> {
  let q = getSupabaseAdmin()
    .from("categories")
    .select("id, name, site")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (site && site !== "both") {
    q = q.eq("site", site);
  }
  const { data } = await q;
  return (data ?? []) as EntryCategory[];
}

// --------------------------------------------------------------------------
// Permission helpers (reused by route handlers)
// --------------------------------------------------------------------------

export function canCreateEntry(userRoles: AppRole[]): boolean {
  // Per the permission matrix: everyone can create entries.
  return userRoles.length > 0;
}
