import { NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  parseJsonBody,
  parseSearchParams,
} from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listEntries,
  type ListEntriesFilters,
} from "@/lib/entries/queries";
import { createEntry, createEntrySchema } from "@/lib/entries/mutations";
import { hasAnyRoleForSite } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

const queryBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();
const entriesQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  site: z.enum(["pl", "qb", "both"]).optional(),
  tierId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  contentStatus: z
    .enum(["writer_needed", "claim_requested", "claimed", "submitted", "polishing"])
    .optional(),
  editorStatus: z.enum(["none", "ready_for_edit", "edited", "scheduled"]).optional(),
  priority: queryBoolean,
  authorId: z.uuid().optional(),
  includeArchived: queryBoolean,
  includeHistorical: queryBoolean,
  archivedOnly: queryBoolean,
  historicalOnly: queryBoolean,
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(["publish_date", "created_at", "updated_at", "title"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

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
    return errorResponse(401, "Not authenticated");
  }

  const parsed = parseSearchParams(request, entriesQuerySchema);
  if (!parsed.ok) return parsed.response;
  const query = parsed.data;
  const filters: ListEntriesFilters = {
    search: query.search || undefined,
    site: query.site,
    tierId: query.tierId,
    categoryId: query.categoryId,
    contentStatus: query.contentStatus,
    editorStatus: query.editorStatus,
    priority: query.priority,
    authorId: query.authorId,
    includeArchived: query.includeArchived,
    includeHistorical: query.includeHistorical,
    archivedOnly: query.archivedOnly,
    historicalOnly: query.historicalOnly,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  };
  if (query.page !== undefined || query.pageSize !== undefined) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    filters.limit = pageSize;
    filters.offset = (page - 1) * pageSize;
  } else {
    filters.limit = query.limit;
    filters.offset = query.offset;
  }

  const result = await listEntries(filters);
  return NextResponse.json(result);
}

/** POST /api/entries — create a new entry. */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const parsed = await parseJsonBody(request, createEntrySchema);
  if (!parsed.ok) return parsed.response;
  if (!hasAnyRoleForSite(viewer, parsed.data.site)) {
    return errorResponse(
      403,
      "You do not have access to create entries for this site",
    );
  }

  const result = await createEntry(viewer.id, parsed.data);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }

  return NextResponse.json({ entry_id: result.entryId });
}
