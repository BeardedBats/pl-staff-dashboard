import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { activateSeasonMode } from "@/lib/season-modes/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/season-modes/:id/activate
 *
 * Flip the is_active flag so exactly one season mode is active. Admin+ only.
 * Side effect: recurring templates tagged with this season_mode_id will
 * start generating entries on the next cron tick; templates for other
 * seasons will pause.
 */
export async function PATCH(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return errorResponse(403, "Forbidden");
  }

  const { id } = await context.params;
  const result = await activateSeasonMode(id);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }
  return NextResponse.json({ ok: true });
}
