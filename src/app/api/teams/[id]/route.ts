import { NextResponse } from "next/server";
import {
  getCurrentUser,
  isAdminPlus,
  isManagerPlus,
} from "@/lib/auth/current-user";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const team = await getTeamById(id);
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  return NextResponse.json({ team });
}

/**
 * PATCH /api/teams/:id — Update team. Admin+ OR the team's own manager.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getTeamById(id);
  if (!existing) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const isOwnManager =
    isManagerPlus(viewer) && existing.manager_id === viewer.id;
  if (!isAdminPlus(viewer) && !isOwnManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Non-admin managers can't reassign the manager_id (would let them abandon
  // their own approval responsibilities).
  if (!isAdminPlus(viewer) && parsed.data.manager_id) {
    return NextResponse.json(
      { error: "Only Admin+ can reassign team managers" },
      { status: 403 },
    );
  }

  const ok = await updateTeam(id, parsed.data);
  if (!ok) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  const team = await getTeamById(id);
  return NextResponse.json({ team });
}

/** DELETE /api/teams/:id — Admin+ only. */
export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const ok = await deleteTeam(id);
  if (!ok) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
