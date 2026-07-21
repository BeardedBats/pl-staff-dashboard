import { NextResponse } from "next/server";
import {
  getCurrentUser,
} from "@/lib/auth/current-user";
import {
  isAdminPlusForScope,
  isManagerPlusForScope,
} from "@/lib/auth/authorization";
import {
  getTeamById,
  removeTeamMember,
  setMemberPrimary,
} from "@/lib/teams/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/**
 * DELETE /api/teams/:id/members/:userId — remove a user from a team.
 * Admin+ OR the team's own manager.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: teamId, userId } = await context.params;
  const team = await getTeamById(teamId);
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const isOwnManager =
    isManagerPlusForScope(viewer, team.site) && team.manager_id === viewer.id;
  if (!isAdminPlusForScope(viewer, team.site) && !isOwnManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ok = await removeTeamMember(teamId, userId);
  if (!ok) {
    return NextResponse.json({ error: "Remove failed" }, { status: 500 });
  }

  const updated = await getTeamById(teamId);
  return NextResponse.json({ team: updated });
}

/**
 * PATCH /api/teams/:id/members/:userId — mark this team as the user's primary.
 * Admin+ OR the team's own manager.
 */
export async function PATCH(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: teamId, userId } = await context.params;
  const team = await getTeamById(teamId);
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const isOwnManager =
    isManagerPlusForScope(viewer, team.site) && team.manager_id === viewer.id;
  if (!isAdminPlusForScope(viewer, team.site) && !isOwnManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await setMemberPrimary(teamId, userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const updated = await getTeamById(teamId);
  return NextResponse.json({ team: updated });
}
