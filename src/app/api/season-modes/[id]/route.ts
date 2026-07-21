import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import {
  updateSeasonMode,
  updateSeasonModeSchema,
} from "@/lib/season-modes/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/season-modes/:id — update auto-switch dates. Admin+ only. */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return errorResponse(403, "Forbidden");
  }

  const { id } = await context.params;

  const parsed = await parseJsonBody(request, updateSeasonModeSchema);
  if (!parsed.ok) return parsed.response;

  const ok = await updateSeasonMode(id, parsed.data);
  if (!ok) {
    return errorResponse(500, "Update failed");
  }
  return NextResponse.json({ ok: true });
}
