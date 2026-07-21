import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { listTeams, createTeam, createTeamSchema } from "@/lib/teams/data";
import type { AppSite } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/teams — list all teams. Visible to every signed-in user.
 * Optional `?site=pl|qb|both` filter.
 */
export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const site = url.searchParams.get("site") as AppSite | null;

  const teams = await listTeams({
    site: site && ["pl", "qb", "both"].includes(site) ? site : undefined,
  });

  return NextResponse.json({ teams });
}

/**
 * POST /api/teams — Admin+ only. Create a new team.
 */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!isAdminPlusForScope(viewer, parsed.data.site)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await createTeam(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ team_id: result.id });
}
