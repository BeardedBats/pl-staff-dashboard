import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getEntryById } from "@/lib/entries/queries";
import { updateEntry, updateEntrySchema } from "@/lib/entries/mutations";
import {
  canEditEntryResource,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/entries/:id — full entry detail. */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const entry = await getEntryById(viewer, id);
  if (!entry) {
    return errorResponse(404, "Entry not found");
  }
  return NextResponse.json({ entry });
}

/** PATCH /api/entries/:id — update fields (non-status). */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const authorization = await loadEntryAuthorizationContext(id);
  if (!authorization) {
    return errorResponse(404, "Entry not found");
  }
  if (!canEditEntryResource(viewer, authorization)) {
    return errorResponse(403, "Forbidden");
  }

  const parsed = await parseJsonBody(request, updateEntrySchema);
  if (!parsed.ok) return parsed.response;

  const result = await updateEntry(viewer.id, id, parsed.data);
  if (!result.ok) {
    switch (result.kind) {
      case "completed_checklist":
        return errorResponse(
          409,
          "Tier changes are blocked after checklist work is completed",
        );
      case "not_found":
        return errorResponse(404, "Entry not found");
      case "invalid_reference":
        return errorResponse(400, "Entry update references invalid data");
      case "database":
        return errorResponse(500, "Update failed");
    }
  }

  const updated = await getEntryById(viewer, id);
  return NextResponse.json({ entry: updated });
}
