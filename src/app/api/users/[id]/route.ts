import { NextResponse } from "next/server";
import {
  getCurrentUser,
} from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { getUserById } from "@/lib/users/queries";
import { sanitizeUserForViewer } from "@/lib/users/visibility";
import { getTeamById } from "@/lib/teams/data";
import {
  ADMIN_ONLY_PROFILE_FIELDS,
  setUserPrimaryTeam,
  setUserRoles,
  updateUserProfile,
  userProfileUpdateSchema,
} from "@/lib/users/mutations";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/users/:id — fetch a user profile.
 *
 * Field visibility depends on the viewer:
 *   - Everyone sees display_name, avatar, bio, roles, teams, socials.
 *   - Only the user themselves + Admin+ sees email, discord_id, timezone,
 *     notification/auto-approve preferences, sensitive flags.
 */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user: sanitizeUserForViewer(target, viewer) });
}

/**
 * PATCH /api/users/:id — update profile.
 *
 * Users may edit their own profile (display_name, bio, socials, prefs).
 * Admin+ may additionally edit privileged fields — `wp_site`,
 * `can_publish`, `roles`, `team_id` — on any user. If a self-edit
 * includes those fields, we 403 the whole request so a clever client
 * can't promote themselves.
 *
 * Role replacement and primary-team assignment happen via dedicated
 * helpers after the users-row update. Supabase JS can't open a true
 * Postgres transaction so this isn't fully atomic — if the roles step
 * fails after the row update succeeds, the caller gets a 500 and the
 * users row will already reflect the new profile fields. We surface
 * the failed step in the error message so the dialog can show it.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const targetBefore = await getUserById(id);
  if (!targetBefore) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const isSelf = viewer.id === id;
  const isAdmin = isAdminPlusForScope(viewer, targetBefore.wp_site);
  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = userProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;

  const adminFieldsPresent = ADMIN_ONLY_PROFILE_FIELDS.some(
    (key) => input[key] !== undefined,
  );
  if (adminFieldsPresent && !isAdmin) {
    return NextResponse.json(
      { error: "Forbidden: admin-only fields in payload" },
      { status: 403 },
    );
  }
  if (
    input.roles?.some(
      (assignment) => !isAdminPlusForScope(viewer, assignment.site),
    )
  ) {
    return NextResponse.json(
      { error: "Forbidden: role assignment exceeds your site authority" },
      { status: 403 },
    );
  }
  if (
    input.wp_site !== undefined &&
    !isAdminPlusForScope(viewer, input.wp_site)
  ) {
    return NextResponse.json(
      { error: "Forbidden: site change exceeds your authority" },
      { status: 403 },
    );
  }
  if (input.team_id) {
    const team = await getTeamById(input.team_id);
    if (!team || !isAdminPlusForScope(viewer, team.site)) {
      return NextResponse.json(
        { error: "Forbidden: team assignment exceeds your site authority" },
        { status: 403 },
      );
    }
  }

  const ok = await updateUserProfile(id, input);
  if (!ok) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  if (input.roles !== undefined) {
    const result = await setUserRoles(id, input.roles);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  }

  if (input.team_id !== undefined) {
    const result = await setUserPrimaryTeam(id, input.team_id ?? null);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  }

  const updated = await getUserById(id);
  return NextResponse.json({
    user: updated ? sanitizeUserForViewer(updated, viewer) : null,
  });
}
