import "server-only";

import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/identity/normalization";
import {
  validateWpAnywhere,
  type WpSiteKey,
  type WpUser,
} from "@/lib/auth/wordpress";
import {
  createTokenPair,
  setAuthCookies,
} from "@/lib/auth/session";

/**
 * Full login flow:
 *   1. Validate credentials against WordPress (PL first, then QB).
 *   2. Upsert the corresponding `users` row (creates on first login, updates
 *      display_name / email / avatar on subsequent logins).
 *   3. Create a `sessions` row.
 *   4. Generate access + refresh JWTs, store hashes, set cookies.
 *   5. Return the authenticated user shape.
 *
 * Failures return a discriminated-union result. Callers translate those
 * into HTTP responses.
 */

export type LoginResult =
  | {
      ok: true;
      user: {
        id: string;
        email: string;
        display_name: string;
        wp_site: WpSiteKey | "both";
        onboarding_completed: boolean;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function performLogin(
  username: string,
  password: string,
): Promise<LoginResult> {
  const wpResult = await validateWpAnywhere(username, password);

  if (!wpResult.ok) {
    const { error } = wpResult;
    if (error.kind === "invalid_credentials") {
      return { ok: false, status: 401, error: "Invalid credentials." };
    }
    if (error.kind === "not_configured") {
      return {
        ok: false,
        status: 500,
        error: "WordPress integration is not fully configured on the server.",
      };
    }
    if (error.kind === "network") {
      return {
        ok: false,
        status: 502,
        error: "Could not reach WordPress. Try again in a moment.",
      };
    }
    return {
      ok: false,
      status: 500,
      error: `Unexpected WordPress error (${error.status}).`,
    };
  }

  const { site: wpSite, user: wpUser } = wpResult;
  const supabase = getSupabaseAdmin();

  const dbUser = await upsertUserFromWp(wpSite, wpUser);
  if (!dbUser) {
    return {
      ok: false,
      status: 500,
      error: "Failed to create or update your user profile.",
    };
  }

  // Generate the session ID first so no placeholder token family is ever
  // visible in the database between insert and update.
  const sessionId = crypto.randomUUID();
  const pair = createTokenPair(dbUser.id, sessionId);
  const { error: sessionError } = await supabase
    .from("sessions")
    .insert({
      id: sessionId,
      user_id: dbUser.id,
      token_hash: pair.accessTokenHash,
      refresh_token_hash: pair.refreshTokenHash,
      expires_at: pair.refreshExpiresAt.toISOString(),
    });

  if (sessionError) {
    return { ok: false, status: 500, error: "Failed to create session." };
  }

  await setAuthCookies(pair);

  return {
    ok: true,
    user: {
      id: dbUser.id,
      email: dbUser.email,
      display_name: dbUser.display_name,
      wp_site: dbUser.wp_site,
      onboarding_completed: dbUser.onboarding_completed,
    },
  };
}

type DbUser = {
  id: string;
  email: string;
  display_name: string;
  wp_site: WpSiteKey | "both";
  onboarding_completed: boolean;
};

async function upsertUserFromWp(
  site: WpSiteKey,
  wp: WpUser,
): Promise<DbUser | null> {
  const supabase = getSupabaseAdmin();
  const normalizedEmail = normalizeEmail(wp.email);

  // 1. Look for an existing user by (wp_user_id, wp_site) OR by email.
  //    An editor who later also writes for QB List might have 'both' as site —
  //    we match on email as the stable identifier.
  const { data: emailMatch } = await supabase
    .from("users")
    .select("id, wp_site, onboarding_completed, display_name, email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  const { data: identityMatch } = emailMatch
    ? { data: null }
    : await supabase
        .from("users")
        .select("id, wp_site, onboarding_completed, display_name, email")
        .eq("wp_user_id", wp.id)
        .in("wp_site", [site, "both"])
        .maybeSingle();

  const existing = emailMatch ?? identityMatch;

  if (existing) {
    // Merge: if they originally logged in via PL and now hit QB (or vice versa),
    // bump wp_site to 'both'.
    const currentSite = existing.wp_site as WpSiteKey | "both";
    const nextSite: WpSiteKey | "both" =
      currentSite === site || currentSite === "both" ? currentSite : "both";

    const { data: updated, error } = await supabase
      .from("users")
      .update({
        wp_site: nextSite,
        email: normalizedEmail,
        display_name: wp.name,
        avatar_url: wp.avatar_url,
        bio: wp.description || null,
        last_wp_sync: new Date().toISOString(),
      })
      .eq("id", existing.id as string)
      .select("id, email, display_name, wp_site, onboarding_completed")
      .single();

    if (error || !updated) return null;
    return {
      id: updated.id as string,
      email: updated.email as string,
      display_name: updated.display_name as string,
      wp_site: updated.wp_site as WpSiteKey | "both",
      onboarding_completed: Boolean(updated.onboarding_completed),
    };
  }

  // 2. Otherwise create a fresh user row.
  const { data: created, error: createError } = await supabase
    .from("users")
    .insert({
      wp_user_id: wp.id,
      wp_site: site,
      email: normalizedEmail,
      display_name: wp.name,
      avatar_url: wp.avatar_url,
      bio: wp.description || null,
      last_wp_sync: new Date().toISOString(),
    })
    .select("id, email, display_name, wp_site, onboarding_completed")
    .single();

  if (createError || !created) return null;

  // 3. Seed a default role. WP roles → dashboard roles mapping. Admins/eics
  //    are assigned manually later; new logins always start as 'writer' unless
  //    their WP role is something more elevated. This is conservative on
  //    purpose — escalation happens in Admin settings.
  const wpRoles = wp.wp_roles;
  const dashboardRole: "writer" | "editor" | "admin" =
    wpRoles.includes("administrator")
      ? "admin"
      : wpRoles.some((r) => r === "editor" || r === "author")
        ? "editor"
        : "writer";

  await supabase.from("user_roles").insert({
    user_id: created.id as string,
    role: dashboardRole,
    site,
  });

  return {
    id: created.id as string,
    email: created.email as string,
    display_name: created.display_name as string,
    wp_site: created.wp_site as WpSiteKey | "both",
    onboarding_completed: Boolean(created.onboarding_completed),
  };
}
