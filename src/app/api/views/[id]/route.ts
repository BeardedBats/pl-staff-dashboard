import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  deleteView,
  getViewById,
  updateView,
  updateViewSchema,
} from "@/lib/views/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/views/:id — update a saved view. Owner only. */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const existing = await getViewById(id, viewer.id);
  if (!existing) {
    return errorResponse(404, "View not found");
  }

  const parsed = await parseJsonBody(request, updateViewSchema);
  if (!parsed.ok) return parsed.response;

  const result = await updateView(id, viewer.id, parsed.data);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/views/:id — delete a saved view. Owner only. */
export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const existing = await getViewById(id, viewer.id);
  if (!existing) {
    return errorResponse(404, "View not found");
  }

  const ok = await deleteView(id, viewer.id);
  if (!ok) {
    return errorResponse(500, "Delete failed");
  }
  return NextResponse.json({ ok: true });
}
