import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCurrentUser,
  isAdminPlus,
  isManagerPlus,
} from "@/lib/auth/current-user";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: teamId } = await context.params;
  const team = await getTeamById(teamId);
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const isOwnManager = isManagerPlus(viewer) && team.manager_id === viewer.id;
  if (!isAdminPlus(viewer) && !isOwnManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await addTeamMember(
    teamId,
    parsed.data.user_id,
    parsed.data.is_primary,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const updated = await getTeamById(teamId);
  return NextResponse.json({ team: updated });
}
