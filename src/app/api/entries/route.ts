import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listEntries,
  type ListEntriesFilters,
  type ContentStatus,
  type EditorStatus,
} from "@/lib/entries/queries";
import { createEntry, createEntrySchema } from "@/lib/entries/mutations";
import type { AppSite } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

const CONTENT_STATUSES: ContentStatus[] = [
  "writer_needed",
  "claim_requested",
  "claimed",
  "submitted",
  "polishing",
];
const EDITOR_STATUSES: EditorStatus[] = [
  "none",
  "ready_for_edit",
  "edited",
  "scheduled",
];
const SITES: AppSite[] = ["pl", "qb", "both"];

/**
 * GET /api/entries
 *
 * Query params (all optional):
 *   search, site, tierId, categoryId, contentStatus, editorStatus, priority,
 *   authorId, includeArchived, dateFrom, dateTo, sortBy, sortDir, limit, offset
 */
export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters: ListEntriesFilters = {};

  const search = url.searchParams.get("search");
  if (search) filters.search = search;

  const site = url.searchParams.get("site");
  if (site && SITES.includes(site as AppSite)) filters.site = site as AppSite;

  const tierId = url.searchParams.get("tierId");
  if (tierId) filters.tierId = tierId;

  const categoryId = url.searchParams.get("categoryId");
  if (categoryId) filters.categoryId = categoryId;

  const contentStatus = url.searchParams.get("contentStatus");
  if (contentStatus && CONTENT_STATUSES.includes(contentStatus as ContentStatus)) {
    filters.contentStatus = contentStatus as ContentStatus;
  }

  const editorStatus = url.searchParams.get("editorStatus");
  if (editorStatus && EDITOR_STATUSES.includes(editorStatus as EditorStatus)) {
    filters.editorStatus = editorStatus as EditorStatus;
  }

  const priority = url.searchParams.get("priority");
  if (priority === "true") filters.priority = true;
  if (priority === "false") filters.priority = false;

  const authorId = url.searchParams.get("authorId");
  if (authorId) filters.authorId = authorId;

  if (url.searchParams.get("includeArchived") === "true") {
    filters.includeArchived = true;
  }

  const dateFrom = url.searchParams.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;
  const dateTo = url.searchParams.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;

  const sortBy = url.searchParams.get("sortBy");
  if (sortBy && ["publish_date", "created_at", "updated_at", "title"].includes(sortBy)) {
    filters.sortBy = sortBy as ListEntriesFilters["sortBy"];
  }
  const sortDir = url.searchParams.get("sortDir");
  if (sortDir === "asc" || sortDir === "desc") filters.sortDir = sortDir;

  const limit = Number(url.searchParams.get("limit") ?? "50");
  filters.limit = Math.min(Math.max(Number.isFinite(limit) ? limit : 50, 1), 200);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  filters.offset = Math.max(Number.isFinite(offset) ? offset : 0, 0);

  const result = await listEntries(filters);
  return NextResponse.json(result);
}

/** POST /api/entries — create a new entry. */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await createEntry(viewer.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ entry_id: result.entryId });
}
