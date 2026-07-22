import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { TablesUpdate } from "@/types/database";
import type { AppSite } from "@/lib/auth/current-user";

// --------------------------------------------------------------------------
// Role assignment shape (used by both the dedicated /roles endpoint and the
// admin Edit User dialog, which routes through PATCH /api/users/:id)
// --------------------------------------------------------------------------

export const roleAssignmentSchema = z.object({
  role: z.enum(["writer", "editor", "graphics", "manager", "admin", "eic", "operations"]),
  site: z.enum(["pl", "qb", "both"]),
});

export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

// --------------------------------------------------------------------------
// Profile updates
// --------------------------------------------------------------------------

/** Fields a user can edit on their own profile. */
export const userProfileUpdateSchema = z.object({
  display_name: z.string().trim().min(1).max(120).optional(),
  bio: z.string().max(2000).nullable().optional(),
  twitter_handle: z
    .string()
    .trim()
    .max(32)
    .regex(/^@?[A-Za-z0-9_]+$/, "Letters, numbers, and underscores only")
    .nullable()
    .optional(),
  bluesky_handle: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional(),
  discord_id: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9]+$/, "Discord user IDs are numeric")
    .nullable()
    .optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  theme: z.enum(["dark", "light"]).optional(),
  auto_approve_drafts: z.boolean().optional(),
  email: z.email().optional(),
  // Admin-only fields. Route handler MUST gate these on isAdminPlus; the
  // schema accepts them so the same PATCH endpoint can power the admin
  // Edit User dialog without spinning up a parallel route.
  wp_site: z.enum(["pl", "qb", "both"]).optional(),
  can_publish: z.boolean().optional(),
  roles: z.array(roleAssignmentSchema).optional(),
  team_id: z.uuid().nullable().optional(),
});

export type UserProfileUpdate = z.infer<typeof userProfileUpdateSchema>;

/**
 * Which fields on UserProfileUpdate may only be set by an admin. The route
 * handler uses this to reject self-edits that include privileged fields.
 */
export const ADMIN_ONLY_PROFILE_FIELDS = [
  "wp_site",
  "can_publish",
  "roles",
  "team_id",
] as const;

/**
 * Update a user's profile fields. Returns `true` on success.
 * Caller is responsible for permission checks.
 *
 * If `display_name` is in the input we also flip `display_name_override`
 * so the WP sync cron leaves the name alone on future runs.
 *
 * Role and primary-team mutations are handled separately by
 * `setUserRoles` and `setUserPrimaryTeam`; this function only touches the
 * `users` row.
 */
export async function updateUserProfile(
  userId: string,
  input: UserProfileUpdate,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  // Strip fields that aren't columns on `users`; those are handled by
  // dedicated helpers (roles + primary team).
  const { roles: _roles, team_id: _teamId, ...rest } = input;
  void _roles;
  void _teamId;

  const normalized: TablesUpdate<"users"> = {
    ...rest,
    email:
      typeof rest.email === "string"
        ? rest.email.trim().toLowerCase()
        : rest.email,
    twitter_handle: rest.twitter_handle
      ? rest.twitter_handle.replace(/^@/, "")
      : rest.twitter_handle,
    updated_at: new Date().toISOString(),
  };

  // Lock the name against future WP overwrites whenever an admin (or the
  // user themselves) explicitly writes a display_name.
  if (typeof rest.display_name === "string") {
    normalized.display_name_override = true;
  }

  const { error } = await supabase
    .from("users")
    .update(normalized)
    .eq("id", userId);

  return !error;
}

/**
 * Set (or clear) a user's primary team.
 *
 * Pass `null` to demote any existing primary team without removing the
 * user from team_members. Pass a team UUID to make that team the user's
 * primary — if they aren't yet a member, they're added; if they are, the
 * primary flag flips and any previous primary is demoted.
 */
export async function setUserPrimaryTeam(
  userId: string,
  teamId: string | null,
  fallbackSite: "pl" | "qb" | "both" = "pl",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  if (teamId === null) {
    const { error } = await supabase
      .from("team_members")
      .update({ is_primary: false })
      .eq("user_id", userId)
      .eq("is_primary", true);
    if (error) return { ok: false, error: "Failed to clear primary team" };
    return { ok: true };
  }

  // Demote any existing primary for this user, then upsert membership on
  // the target team with is_primary = true. Mirrors `addTeamMember` in
  // lib/teams/data.ts but kept inline so the user-edit flow doesn't pull
  // in the broader teams mutation surface.
  void fallbackSite;
  await supabase
    .from("team_members")
    .update({ is_primary: false })
    .eq("user_id", userId)
    .eq("is_primary", true);

  const { data: existing } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("team_members")
      .update({ is_primary: true })
      .eq("id", existing.id as string);
    if (error) return { ok: false, error: "Failed to set primary team" };
    return { ok: true };
  }

  const { error } = await supabase.from("team_members").insert({
    team_id: teamId,
    user_id: userId,
    is_primary: true,
  });
  if (error) return { ok: false, error: "Failed to join team as primary" };
  return { ok: true };
}

// --------------------------------------------------------------------------
// Role management (Admin+ only)
// --------------------------------------------------------------------------

/**
 * Replace a user's entire role set atomically. Pass an empty array to strip
 * all roles (leaves the row as an unroled ghost — use with care).
 */
export async function setUserRoles(
  userId: string,
  roles: RoleAssignment[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { error: deleteError } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    return { ok: false, error: "Failed to clear existing roles" };
  }

  if (roles.length === 0) return { ok: true };

  const rows = roles.map((r) => ({
    user_id: userId,
    role: r.role,
    site: r.site,
  }));

  const { error: insertError } = await supabase.from("user_roles").insert(rows);
  if (insertError) {
    return { ok: false, error: "Failed to insert new roles" };
  }

  return { ok: true };
}

/** Toggle can_publish on a user. Admin+ only. */
export async function setCanPublish(
  userId: string,
  canPublish: boolean,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("users")
    .update({ can_publish: canPublish, updated_at: new Date().toISOString() })
    .eq("id", userId);
  return !error;
}

// --------------------------------------------------------------------------
// Manual WP import (Admin+ only)
// --------------------------------------------------------------------------

import {
  fetchWpUserById,
  fetchWpUserByUsername,
  wpRoleToDashboardRole,
  isStaffWpUser,
  type WpUser,
  type WpSiteKey,
  type WpAdminError,
} from "@/lib/auth/wordpress";

/**
 * Admin "import a specific WP user" flow. Fetches the user from WordPress
 * with admin credentials, creates or updates the local `users` row, and
 * seeds a role if the user is new.
 *
 * Returns the newly created/updated user ID on success.
 */
export async function importWpUser(
  site: WpSiteKey,
  lookup: { wpUserId?: number; username?: string },
): Promise<{ ok: true; userId: string; created: boolean } | { ok: false; error: string }> {
  let wpResult: Awaited<ReturnType<typeof fetchWpUserById>>;

  if (typeof lookup.wpUserId === "number") {
    wpResult = await fetchWpUserById(site, lookup.wpUserId);
  } else if (lookup.username) {
    wpResult = await fetchWpUserByUsername(site, lookup.username);
  } else {
    return { ok: false, error: "Provide wpUserId or username" };
  }

  if (!wpResult.ok) {
    return { ok: false, error: publicWpAdminError(wpResult.error) };
  }

  const wpUser: WpUser = wpResult.value;

  if (!isStaffWpUser(wpUser.wp_roles)) {
    return {
      ok: false,
      error: "This WP user is not a staff role (administrator / editor / author).",
    };
  }

  const supabase = getSupabaseAdmin();
  const normalizedEmail = wpUser.email.trim().toLowerCase();

  const { data: emailMatch } = await supabase
    .from("users")
    .select("id, wp_site")
    .eq("email", normalizedEmail)
    .maybeSingle();

  const { data: identityMatch } = emailMatch
    ? { data: null }
    : await supabase
        .from("users")
        .select("id, wp_site")
        .eq("wp_user_id", wpUser.id)
        .in("wp_site", [site, "both"])
        .maybeSingle();

  const existing = emailMatch ?? identityMatch;

  if (existing) {
    const currentSite = existing.wp_site as AppSite;
    const nextSite: AppSite =
      currentSite === site || currentSite === "both" ? currentSite : "both";

    await supabase
      .from("users")
      .update({
        wp_site: nextSite,
        email: normalizedEmail,
        display_name: wpUser.name,
        avatar_url: wpUser.avatar_url,
        bio: wpUser.description || null,
        last_wp_sync: new Date().toISOString(),
      })
      .eq("id", existing.id as string);

    return { ok: true, userId: existing.id as string, created: false };
  }

  const { data: created, error } = await supabase
    .from("users")
    .insert({
      wp_user_id: wpUser.id,
      wp_site: site,
      email: normalizedEmail,
      display_name: wpUser.name,
      avatar_url: wpUser.avatar_url,
      bio: wpUser.description || null,
      last_wp_sync: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    return { ok: false, error: "Failed to create user row" };
  }

  // Seed a default role.
  const role = wpRoleToDashboardRole(wpUser.wp_roles);
  await supabase.from("user_roles").insert({
    user_id: created.id as string,
    role,
    site,
  });

  return { ok: true, userId: created.id as string, created: true };
}

// --------------------------------------------------------------------------
// Re-sync profile from WP (pulls bio, avatar, display_name)
// --------------------------------------------------------------------------

/**
 * Pull the latest profile info from WordPress and update the local row.
 * Used by the profile-sync cron and the "Refresh from WP" button.
 */
export async function resyncUserFromWp(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: user } = await supabase
    .from("users")
    .select("wp_user_id, wp_site")
    .eq("id", userId)
    .maybeSingle();

  if (!user) return { ok: false, error: "User not found" };

  const site = user.wp_site as AppSite;
  const preferredSite: WpSiteKey = site === "qb" ? "qb" : "pl";

  const wpResult = await fetchWpUserById(preferredSite, user.wp_user_id as number);
  if (!wpResult.ok) {
    return { ok: false, error: publicWpAdminError(wpResult.error) };
  }

  const wp = wpResult.value;
  const { error } = await supabase
    .from("users")
    .update({
      display_name: wp.name,
      avatar_url: wp.avatar_url,
      bio: wp.description || null,
      last_wp_sync: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { ok: false, error: "DB update failed" };
  return { ok: true };
}

function publicWpAdminError(error: WpAdminError): string {
  switch (error.kind) {
    case "not_configured":
      return "WordPress is not configured for this site";
    case "not_found":
      return "WordPress user not found";
    case "network":
      return "Could not reach WordPress. Try again in a moment.";
    case "unexpected":
      return `WordPress request failed (${error.status})`;
  }
}
