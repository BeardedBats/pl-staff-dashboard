import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import {
  getCurrentUser,
} from "@/lib/auth/current-user";
import {
  isAdminPlusForScope,
  isManagerPlusForScope,
} from "@/lib/auth/authorization";
import {
  addTeamMember,
  getTeamById,
} from "@/lib/teams/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  user_id: z.uuid(),
  is_primary: z.boolean().optional().default(false),
});

/**
 * POST /api/teams/:id/members — add a user to a team.
 *
 * Admin+ OR the team's own manager. Setting `is_primary = true` automatically
 * demotes the user's previous primary team.
 */
export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id: teamId } = await context.params;
  const team = await getTeamById(teamId);
  if (!team) {
    return errorResponse(404, "Team not found");
  }

  const isOwnManager =
    isManagerPlusForScope(viewer, team.site) && team.manager_id === viewer.id;
  if (!isAdminPlusForScope(viewer, team.site) && !isOwnManager) {
    return errorResponse(403, "Forbidden");
  }

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const result = await addTeamMember(
    teamId,
    parsed.data.user_id,
    parsed.data.is_primary,
  );
  if (!result.ok) {
    return errorResponse(500, result.error);
  }

  const updated = await getTeamById(teamId);
  return NextResponse.json({ team: updated });
}
