import { NextResponse } from "next/server";
import {
  getCurrentUser,
  isAdminPlus,
  type CurrentUser,
} from "@/lib/auth/current-user";
import { getUserById, type StaffUserSummary } from "@/lib/users/queries";
import {
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

  return NextResponse.json({ user: sanitizeUser(target, viewer) });
}

/**
 * PATCH /api/users/:id — update profile.
 *
 * Users may edit their own profile. Admin+ may edit anyone's profile.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const isSelf = viewer.id === id;
  if (!isSelf && !isAdminPlus(viewer)) {
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

  const ok = await updateUserProfile(id, parsed.data);
  if (!ok) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  const updated = await getUserById(id);
  return NextResponse.json({ user: updated ? sanitizeUser(updated, viewer) : null });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function sanitizeUser(target: StaffUserSummary, viewer: CurrentUser) {
  const isSelf = target.id === viewer.id;
  const isPrivileged = isSelf || isAdminPlus(viewer);

  const publicFields = {
    id: target.id,
    wp_user_id: target.wp_user_id,
    wp_site: target.wp_site,
    display_name: target.display_name,
    avatar_url: target.avatar_url,
    bio: target.bio,
    twitter_handle: target.twitter_handle,
    bluesky_handle: target.bluesky_handle,
    timezone: target.timezone,
    roles: target.roles,
    role_rows: target.role_rows,
    teams: target.teams,
    primary_team: target.primary_team,
    created_at: target.created_at,
    last_wp_sync: target.last_wp_sync,
  };

  if (!isPrivileged) {
    return publicFields;
  }

  return {
    ...publicFields,
    email: target.email,
    discord_id: target.discord_id,
    theme: target.theme,
    can_publish: target.can_publish,
    onboarding_completed: target.onboarding_completed,
    auto_approve_drafts: target.auto_approve_drafts,
  };
}
