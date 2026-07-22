import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canEditorActOnSite,
  canViewEntryResource,
  loadEntryAuthorizationContexts,
} from "@/lib/auth/authorization";
import {
  bulkClaimEditorEntries,
  bulkEditorClaimSchema,
} from "@/lib/entries/bulk-editor-claims";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse(401, "Not authenticated");
  const parsed = await parseJsonBody(request, bulkEditorClaimSchema);
  if (!parsed.ok) return parsed.response;

  const authorization = await loadEntryAuthorizationContexts(parsed.data.entry_ids);
  if (authorization.size !== parsed.data.entry_ids.length) {
    return errorResponse(404, "One or more entries were not found");
  }
  if (
    Array.from(authorization.values()).some(
      (entry) =>
        !canViewEntryResource(viewer, entry) ||
        !canEditorActOnSite(viewer, entry.site),
    )
  ) {
    return errorResponse(403, "Editor access is required for every selected entry site");
  }

  const result = await bulkClaimEditorEntries(viewer.id, parsed.data.entry_ids);
  if (!result.ok) {
    if (result.kind === "not_found") return errorResponse(404, "One or more entries were not found");
    if (result.kind === "conflict") return errorResponse(409, "One or more entries are no longer available to claim");
    if (result.kind === "forbidden") return errorResponse(403, "Editor access is required for every selected entry site");
    if (result.kind === "invalid") return errorResponse(400, "Invalid bulk editor claim");
    return errorResponse(500, "Unable to claim selected edits");
  }
  return NextResponse.json({ ok: true, claimed: result.claimed });
}
