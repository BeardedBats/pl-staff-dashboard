import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canViewEntryResource,
  isManagerPlusForSite,
  loadEntryAuthorizationContexts,
} from "@/lib/auth/authorization";
import {
  bulkEntryUpdateSchema,
  bulkUpdateEntries,
} from "@/lib/entries/bulk-mutations";

export const dynamic = "force-dynamic";

/**
 * POST /api/entries/bulk
 *
 * Apply a single simple field update to many entries at once. Manager+ only.
 * Status-changing bulk actions are NOT supported here on purpose — those
 * fire notifications / WP sync / audit cascades that need per-entry
 * validation. Use the per-entry endpoints for those.
 *
 * Supported actions:
 *   - archive / unarchive   → flips is_archived, writes audit per entry
 *   - set_priority          → flips priority flag
 *   - change_tier           → re-assigns tier_id (useful for reclassification)
 */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const parsed = await parseJsonBody(request, bulkEntryUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const input = parsed.data;
  const authorization = await loadEntryAuthorizationContexts(input.entry_ids);
  if (authorization.size !== input.entry_ids.length) {
    return errorResponse(404, "One or more entries were not found");
  }
  if (
    Array.from(authorization.values()).some(
      (entry) =>
        !canViewEntryResource(viewer, entry) ||
        !isManagerPlusForSite(viewer, entry.site),
    )
  ) {
    return errorResponse(
      403,
      "Manager+ access is required for every affected entry site",
    );
  }
  const result = await bulkUpdateEntries(viewer.id, input);
  if (!result.ok) {
    switch (result.kind) {
      case "completed_checklist":
        return errorResponse(
          409,
          "Tier changes are blocked when any selected entry has completed checklist work",
        );
      case "not_found":
        return errorResponse(404, "One or more entries were not found");
      case "invalid_reference":
      case "invalid_input":
        return errorResponse(400, "Bulk update references invalid data");
      case "database":
        return errorResponse(500, "Bulk update failed");
    }
  }

  return NextResponse.json({
    ok: true,
    selected: input.entry_ids.length,
    updated: result.updated,
  });
}
