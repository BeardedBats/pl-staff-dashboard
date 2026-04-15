import { NextResponse } from "next/server";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const result = await activateSeasonMode(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
