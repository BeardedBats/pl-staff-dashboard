import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  readAccessTokenFromCookies,
  verifyAccessToken,
  type SessionTokenPayload,
} from "@/lib/auth/session";

export type AppRole =
  | "writer"
  | "editor"
  | "graphics"
  | "manager"
  | "admin"
  | "eic"
  | "operations";

export type AppSite = "pl" | "qb" | "both";

export type CurrentUser = {
  id: string;
  wp_user_id: number;
  wp_site: AppSite;
  email: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  timezone: string;
  theme: "dark" | "light";
  can_publish: boolean;
  onboarding_completed: boolean;
  /** Flat list of roles across all sites. */
  roles: AppRole[];
  /** Full role rows including per-site assignment. */
  role_rows: Array<{ role: AppRole; site: AppSite }>;
  /** Session ID — used for logout / token rotation. */
  session_id: string;
};

/**
 * Resolve the currently authenticated user from cookies, or return `null`
 * if unauthenticated or the session is invalid.
 *
 * This is the canonical "who am I" helper and should be called at the top
 * of every API route handler and server component that needs auth.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const accessToken = await readAccessTokenFromCookies();
  if (!accessToken) return null;

  const payload = verifyAccessToken(accessToken);
  if (!payload || !payload.sub || !payload.sid) return null;

  return resolveUserFromPayload(payload);
}

/**
 * Load the full CurrentUser record from the database for a verified payload.
 * Exposed so `/api/auth/refresh` can reuse it after validating the refresh
 * token.
 */
export async function resolveUserFromPayload(
  payload: SessionTokenPayload,
): Promise<CurrentUser | null> {
  const supabase = getSupabaseAdmin();

  const { data: user, error } = await supabase
    .from("users")
    .select(
      "id, wp_user_id, wp_site, email, display_name, avatar_url, bio, timezone, theme, can_publish, onboarding_completed",
    )
    .eq("id", payload.sub)
    .maybeSingle();

  if (error || !user) return null;

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role, site")
    .eq("user_id", payload.sub);

  const rows = (roleRows ?? []) as Array<{ role: AppRole; site: AppSite }>;
  const roles = Array.from(new Set(rows.map((r) => r.role)));

  return {
    id: user.id as string,
    wp_user_id: user.wp_user_id as number,
    wp_site: user.wp_site as AppSite,
    email: user.email as string,
    display_name: user.display_name as string,
    avatar_url: (user.avatar_url as string | null) ?? null,
    bio: (user.bio as string | null) ?? null,
    timezone: user.timezone as string,
    theme: user.theme as "dark" | "light",
    can_publish: Boolean(user.can_publish),
    onboarding_completed: Boolean(user.onboarding_completed),
    roles,
    role_rows: rows,
    session_id: payload.sid,
  };
}

// ---------- Permission helpers ----------

/** Returns true if the user holds ANY of the listed roles. */
export function hasRole(user: CurrentUser, ...roles: AppRole[]): boolean {
  return roles.some((r) => user.roles.includes(r));
}

/** Admin / EIC / Operations — the "admin+" tier from the permission matrix. */
export function isAdminPlus(user: CurrentUser): boolean {
  return hasRole(user, "admin", "eic", "operations");
}

/** Manager or higher. */
export function isManagerPlus(user: CurrentUser): boolean {
  return hasRole(user, "manager", "admin", "eic", "operations");
}

/** Can actually schedule/publish an entry. */
export function canPublish(user: CurrentUser): boolean {
  return user.can_publish || isManagerPlus(user) || hasRole(user, "editor");
}
