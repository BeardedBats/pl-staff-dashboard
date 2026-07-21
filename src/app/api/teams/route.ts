import { NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  parseJsonBody,
  parseSearchParams,
} from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { listTeams, createTeam, createTeamSchema } from "@/lib/teams/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/teams — list all teams. Visible to every signed-in user.
 * Optional `?site=pl|qb|both` filter.
 */
export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const parsed = parseSearchParams(
    request,
    z.object({ site: z.enum(["pl", "qb", "both"]).optional() }),
  );
  if (!parsed.ok) return parsed.response;

  const teams = await listTeams({
    site: parsed.data.site,
  });

  return NextResponse.json({ teams });
}

/**
 * POST /api/teams — Admin+ only. Create a new team.
 */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const parsed = await parseJsonBody(request, createTeamSchema);
  if (!parsed.ok) return parsed.response;
  if (!isAdminPlusForScope(viewer, parsed.data.site)) {
    return errorResponse(403, "Forbidden");
  }

  const result = await createTeam(parsed.data);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }

  return NextResponse.json({ team_id: result.id });
}
