import "server-only";

import {
  canViewEntryResource,
  canViewGraphicResource,
  loadEntryAuthorizationContexts,
} from "@/lib/auth/authorization";
import type { AppSite, CurrentUser } from "@/lib/auth/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  DashboardSearchKind,
  DashboardSearchResponse,
  DashboardSearchResult,
} from "@/lib/search/types";

type EntryRow = {
  id: string;
  title: string;
  site: AppSite;
  content_status: string;
  editor_status: string;
  publish_date: string | null;
};

const resultKinds: DashboardSearchKind[] = [
  "entry",
  "staff",
  "assignment",
  "graphic",
  "schedule",
];

function searchPattern(query: string) {
  return `%${query.replace(/[%_]/g, "").trim()}%`;
}

function titleCaseStatus(value: string) {
  return value.replaceAll("_", " ");
}

async function authorizedEntryRows(
  viewer: CurrentUser,
  rows: EntryRow[],
) {
  const authorization = await loadEntryAuthorizationContexts(rows.map((row) => row.id));
  return rows.filter((row) => {
    const entry = authorization.get(row.id);
    return entry ? canViewEntryResource(viewer, entry) : false;
  });
}

async function searchEntries(
  viewer: CurrentUser,
  pattern: string,
  limit: number,
): Promise<DashboardSearchResult[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("entries")
    .select("id, title, site, content_status, editor_status, publish_date")
    .ilike("title", pattern)
    .eq("is_archived", false)
    .eq("is_historical", false)
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = await authorizedEntryRows(viewer, (data ?? []) as EntryRow[]);
  return rows.map((row) => ({
    id: row.id,
    kind: "entry",
    title: row.title,
    context: `${row.site.toUpperCase()} · ${titleCaseStatus(row.content_status)} · ${titleCaseStatus(row.editor_status)}`,
    href: `/content?entry=${row.id}`,
    site: row.site,
  }));
}

async function searchStaff(
  pattern: string,
  limit: number,
): Promise<DashboardSearchResult[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("id, display_name, wp_site")
    .ilike("display_name", pattern)
    .order("display_name")
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    display_name: string;
    wp_site: AppSite;
  }>).map((row) => ({
    id: row.id,
    kind: "staff",
    title: row.display_name,
    context: `${row.wp_site.toUpperCase()} staff profile`,
    href: `/staff/${row.id}`,
    site: row.wp_site,
  }));
}

async function searchAssignments(
  viewer: CurrentUser,
  pattern: string,
  limit: number,
): Promise<DashboardSearchResult[]> {
  const supabase = getSupabaseAdmin();
  const { data: people, error: peopleError } = await supabase
    .from("users")
    .select("id, display_name")
    .ilike("display_name", pattern)
    .order("display_name")
    .limit(limit);
  if (peopleError) throw peopleError;

  const names = new Map(
    ((people ?? []) as Array<{ id: string; display_name: string }>).map((person) => [
      person.id,
      person.display_name,
    ]),
  );
  if (names.size === 0) return [];

  const userIds = Array.from(names.keys());
  const [authors, editors] = await Promise.all([
    supabase
      .from("entry_authors")
      .select(
        "entry_id, user_id, role, entries!inner(id, title, site, content_status, editor_status, publish_date, is_archived, is_historical)",
      )
      .in("user_id", userIds)
      .eq("entries.is_archived", false)
      .eq("entries.is_historical", false)
      .limit(limit),
    supabase
      .from("entry_editors")
      .select(
        "entry_id, user_id, entries!inner(id, title, site, content_status, editor_status, publish_date, is_archived, is_historical)",
      )
      .in("user_id", userIds)
      .eq("entries.is_archived", false)
      .eq("entries.is_historical", false)
      .limit(limit),
  ]);
  if (authors.error) throw authors.error;
  if (editors.error) throw editors.error;

  type AssignmentRow = {
    entry_id: string;
    user_id: string;
    role?: string;
    entries: EntryRow;
  };
  const rows = [
    ...((authors.data ?? []) as unknown as AssignmentRow[]).map((row) => ({
      ...row,
      assignment: row.role === "co_author" ? "Co-author" : "Writer",
    })),
    ...((editors.data ?? []) as unknown as AssignmentRow[]).map((row) => ({
      ...row,
      assignment: "Editor",
    })),
  ];
  const authorization = await loadEntryAuthorizationContexts(
    Array.from(new Set(rows.map((row) => row.entry_id))),
  );

  return rows
    .filter((row) => {
      const entry = authorization.get(row.entry_id);
      return entry ? canViewEntryResource(viewer, entry) : false;
    })
    .slice(0, limit)
    .map((row) => ({
      id: `${row.entry_id}:${row.user_id}:${row.assignment}`,
      kind: "assignment",
      title: row.entries.title,
      context: `${row.assignment}: ${names.get(row.user_id) ?? "Staff member"}`,
      href: `/content?entry=${row.entry_id}`,
      site: row.entries.site,
    }));
}

async function searchGraphics(
  viewer: CurrentUser,
  pattern: string,
  limit: number,
): Promise<DashboardSearchResult[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("graphic_requests")
    .select(
      "id, entry_id, title, graphic_status, entries!inner(title, site, is_archived)",
    )
    .ilike("title", pattern)
    .eq("entries.is_archived", false)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    entry_id: string;
    title: string;
    graphic_status: string;
    entries: { title: string; site: AppSite; is_archived: boolean };
  }>;
  const authorization = await loadEntryAuthorizationContexts(
    rows.map((row) => row.entry_id),
  );

  return rows
    .filter((row) => {
      const entry = authorization.get(row.entry_id);
      return entry ? canViewGraphicResource(viewer, entry) : false;
    })
    .map((row) => ({
      id: row.id,
      kind: "graphic",
      title: row.title,
      context: `${row.entries.title} · ${titleCaseStatus(row.graphic_status)}`,
      href: `/graphics?request=${row.id}`,
      site: row.entries.site,
    }));
}

async function searchSchedules(
  viewer: CurrentUser,
  pattern: string,
  limit: number,
): Promise<DashboardSearchResult[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("entries")
    .select("id, title, site, content_status, editor_status, publish_date")
    .ilike("title", pattern)
    .not("publish_date", "is", null)
    .eq("is_archived", false)
    .eq("is_historical", false)
    .order("publish_date", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const rows = await authorizedEntryRows(viewer, (data ?? []) as EntryRow[]);
  return rows.map((row) => ({
    id: row.id,
    kind: "schedule",
    title: row.title,
    context: `${row.site.toUpperCase()} · ${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(row.publish_date!))}`,
    href: `/calendar?entry=${row.id}`,
    site: row.site,
  }));
}

export async function searchDashboard(
  viewer: CurrentUser,
  query: string,
  limitPerKind = 5,
): Promise<DashboardSearchResponse> {
  const normalized = query.trim().replace(/\s+/g, " ");
  const pattern = searchPattern(normalized);
  const searches = [
    searchEntries(viewer, pattern, limitPerKind),
    searchStaff(pattern, limitPerKind),
    searchAssignments(viewer, pattern, limitPerKind),
    searchGraphics(viewer, pattern, limitPerKind),
    searchSchedules(viewer, pattern, limitPerKind),
  ];
  const settled = await Promise.allSettled(searches);
  const unavailableKinds = settled.flatMap((result, index) =>
    result.status === "rejected" ? [resultKinds[index]] : [],
  );

  return {
    query: normalized,
    results: settled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
    partial: unavailableKinds.length > 0,
    unavailableKinds,
  };
}
