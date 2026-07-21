import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import {
  getCurrentUser,
} from "@/lib/auth/current-user";
import {
  isAdminPlusForScope,
  isManagerPlusForScope,
} from "@/lib/auth/authorization";
import {
  getTeamById,
  updateTeam,
  deleteTeam,
  updateTeamSchema,
} from "@/lib/teams/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/teams/:id — full team detail + members. */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const team = await getTeamById(id);
  if (!team) {
    return errorResponse(404, "Team not found");
  }
  return NextResponse.json({ team });
}

/**
 * PATCH /api/teams/:id — Update team. Admin+ OR the team's own manager.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const existing = await getTeamById(id);
  if (!existing) {
    return errorResponse(404, "Team not found");
  }

  const isOwnManager =
    isManagerPlusForScope(viewer, existing.site) && existing.manager_id === viewer.id;
  const isSiteAdmin = isAdminPlusForScope(viewer, existing.site);
  if (!isSiteAdmin && !isOwnManager) {
    return errorResponse(403, "Forbidden");
  }

  const parsed = await parseJsonBody(request, updateTeamSchema);
  if (!parsed.ok) return parsed.response;

  // Non-admin managers can't reassign the manager_id (would let them abandon
  // their own approval responsibilities).
  if (!isSiteAdmin && parsed.data.manager_id) {
    return errorResponse(403, "Only Admin+ can reassign team managers");
  }

  const ok = await updateTeam(id, parsed.data);
  if (!ok) {
    return errorResponse(500, "Update failed");
  }

  const team = await getTeamById(id);
  return NextResponse.json({ team });
}

/** DELETE /api/teams/:id — Admin+ only. */
export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  const existing = await getTeamById(id);
  if (!existing) {
    return errorResponse(404, "Team not found");
  }
  if (!isAdminPlusForScope(viewer, existing.site)) {
    return errorResponse(403, "Forbidden");
  }
  const ok = await deleteTeam(id);
  if (!ok) {
    return errorResponse(500, "Delete failed");
  }
  return NextResponse.json({ ok: true });
}
