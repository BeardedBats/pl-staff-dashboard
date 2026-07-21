import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import {
  deleteChecklistItem,
  updateChecklistItem,
  updateChecklistItemSchema,
} from "@/lib/checklist/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/settings/checklist-items/:id — Admin+ only. */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return errorResponse(403, "Forbidden");
  }

  const { id } = await context.params;

  const parsed = await parseJsonBody(request, updateChecklistItemSchema);
  if (!parsed.ok) return parsed.response;

  const ok = await updateChecklistItem(id, parsed.data);
  if (!ok) {
    return errorResponse(500, "Update failed");
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/settings/checklist-items/:id — Admin+ only. */
export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return errorResponse(403, "Forbidden");
  }

  const { id } = await context.params;
  const ok = await deleteChecklistItem(id);
  if (!ok) {
    return errorResponse(500, "Delete failed");
  }
  return NextResponse.json({ ok: true });
}
