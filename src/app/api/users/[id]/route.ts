import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
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
 *   - Only the user themselves + Admin+ sees email, timezone,
 *     notification/auto-approve preferences, sensitive flags.
 */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const target = await getUserById(id);
  if (!target) {
    return errorResponse(404, "User not found");
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
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const targetBefore = await getUserById(id);
  if (!targetBefore) {
    return errorResponse(404, "User not found");
  }
  const isSelf = viewer.id === id;
  const isAdmin = isAdminPlusForScope(viewer, targetBefore.wp_site);
  if (!isSelf && !isAdmin) {
    return errorResponse(403, "Forbidden");
  }

  const parsed = await parseJsonBody(request, userProfileUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const input = parsed.data;

  const adminFieldsPresent = ADMIN_ONLY_PROFILE_FIELDS.some(
    (key) => input[key] !== undefined,
  );
  if (adminFieldsPresent && !isAdmin) {
    return errorResponse(403, "Forbidden: admin-only fields in payload");
  }
  if (
    input.roles?.some(
      (assignment) => !isAdminPlusForScope(viewer, assignment.site),
    )
  ) {
    return errorResponse(
      403,
      "Forbidden: role assignment exceeds your site authority",
    );
  }
  if (
    input.wp_site !== undefined &&
    !isAdminPlusForScope(viewer, input.wp_site)
  ) {
    return errorResponse(403, "Forbidden: site change exceeds your authority");
  }
  if (input.team_id) {
    const team = await getTeamById(input.team_id);
    if (!team || !isAdminPlusForScope(viewer, team.site)) {
      return errorResponse(
        403,
        "Forbidden: team assignment exceeds your site authority",
      );
    }
  }

  const ok = await updateUserProfile(id, input);
  if (!ok) {
    return errorResponse(500, "Update failed");
  }

  if (input.roles !== undefined) {
    const result = await setUserRoles(id, input.roles);
    if (!result.ok) {
      return errorResponse(500, result.error);
    }
  }

  if (input.team_id !== undefined) {
    const result = await setUserPrimaryTeam(id, input.team_id ?? null);
    if (!result.ok) {
      return errorResponse(500, result.error);
    }
  }

  const updated = await getUserById(id);
  return NextResponse.json({
    user: updated ? sanitizeUserForViewer(updated, viewer) : null,
  });
}
