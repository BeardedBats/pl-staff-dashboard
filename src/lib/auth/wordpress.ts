import "server-only";

import { env } from "@/lib/env";

export type WpSiteKey = "pl" | "qb";

export type WpUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  avatar_url: string | null;
  wp_roles: string[];
  description: string;
};

export type WpAuthError =
  | { kind: "invalid_credentials"; message: string }
  | { kind: "network"; message: string }
  | { kind: "not_configured"; message: string }
  | { kind: "unexpected"; status: number; message: string };

export type WpAuthResult =
  | { ok: true; user: WpUser }
  | { ok: false; error: WpAuthError };

type SiteConfig = {
  url: string;
  appUsername: string;
  appPassword: string;
};

function getSiteConfig(site: WpSiteKey): SiteConfig | null {
  if (site === "pl") {
    if (!env.WP_PL_URL || !env.WP_PL_USERNAME || !env.WP_PL_APP_PASSWORD) return null;
    return {
      url: env.WP_PL_URL.replace(/\/$/, ""),
      appUsername: env.WP_PL_USERNAME,
      appPassword: env.WP_PL_APP_PASSWORD,
    };
  }
  if (!env.WP_QB_URL || !env.WP_QB_USERNAME || !env.WP_QB_APP_PASSWORD) return null;
  return {
    url: env.WP_QB_URL.replace(/\/$/, ""),
    appUsername: env.WP_QB_USERNAME,
    appPassword: env.WP_QB_APP_PASSWORD,
  };
}

/** Encode a username + application password for HTTP Basic auth. */
function basicAuth(username: string, password: string): string {
  // WordPress accepts app passwords with spaces — normalize to no-spaces just in case.
  const normalized = password.replace(/\s+/g, "");
  return "Basic " + Buffer.from(`${username}:${normalized}`).toString("base64");
}

/**
 * Validate WordPress credentials against the given site.
 *
 * Uses the WP REST API `/wp/v2/users/me` endpoint with Basic auth, which
 * requires an application password (not a regular login password).
 *
 * @param site      "pl" or "qb"
 * @param username  WordPress username or email
 * @param password  Application password (with or without spaces)
 */
export async function validateWpCredentials(
  site: WpSiteKey,
  username: string,
  password: string,
): Promise<WpAuthResult> {
  const config = getSiteConfig(site);
  if (!config) {
    return {
      ok: false,
      error: {
        kind: "not_configured",
        message: `WordPress ${site.toUpperCase()} is not configured in .env.local`,
      },
    };
  }

  const endpoint = `${config.url}/wp-json/wp/v2/users/me?context=edit`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: basicAuth(username, password),
        Accept: "application/json",
      },
      // Disable Next.js caching — this is an auth request.
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: {
        kind: "network",
        message: "Could not reach WordPress",
      },
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: {
        kind: "invalid_credentials",
        message: "Incorrect username or application password.",
      },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        kind: "unexpected",
        status: response.status,
        message: `WordPress responded with ${response.status}`,
      },
    };
  }

  const data = (await response.json()) as {
    id: number;
    username?: string;
    slug?: string;
    name: string;
    email?: string;
    avatar_urls?: Record<string, string>;
    roles?: string[];
    description?: string;
  };

  // Pick a high-res avatar if available (WP returns 24/48/96 sizes).
  const avatarUrl =
    data.avatar_urls?.["96"] ??
    data.avatar_urls?.["48"] ??
    data.avatar_urls?.["24"] ??
    null;

  return {
    ok: true,
    user: {
      id: data.id,
      username: data.username ?? data.slug ?? "",
      name: data.name,
      email: data.email ?? "",
      avatar_url: avatarUrl,
      wp_roles: data.roles ?? [],
      description: data.description ?? "",
    },
  };
}

/**
 * Validate credentials against PL first, then QB. Returns the first site
 * where the credentials succeed, along with the WP user data.
 *
 * This is the entry point for `/api/auth/login` when the user doesn't
 * explicitly tell us which site they belong to.
 */
export async function validateWpAnywhere(
  username: string,
  password: string,
): Promise<
  | { ok: true; site: WpSiteKey; user: WpUser }
  | { ok: false; error: WpAuthError }
> {
  const plResult = await validateWpCredentials("pl", username, password);
  if (plResult.ok) return { ok: true, site: "pl", user: plResult.user };

  // Only fall through to QB if PL returned invalid_credentials (not a config
  // or network error — those should bubble up immediately).
  if (plResult.error.kind !== "invalid_credentials") {
    return { ok: false, error: plResult.error };
  }

  const qbResult = await validateWpCredentials("qb", username, password);
  if (qbResult.ok) return { ok: true, site: "qb", user: qbResult.user };

  // If QB isn't configured yet, surface the PL failure (more informative).
  if (qbResult.error.kind === "not_configured") {
    return { ok: false, error: plResult.error };
  }
  return { ok: false, error: qbResult.error };
}

// --------------------------------------------------------------------------
// Admin-only: fetch WP users for manual import / profile sync.
//
// These use the site's application password (already configured in env)
// to hit the REST API with admin privileges, so they can see unlisted
// users and the `edit` context (email, roles, etc.).
// --------------------------------------------------------------------------

function adminAuthHeader(site: WpSiteKey): string | null {
  const config = getSiteConfig(site);
  if (!config) return null;
  return basicAuth(config.appUsername, config.appPassword);
}

function siteBaseUrl(site: WpSiteKey): string | null {
  const config = getSiteConfig(site);
  return config ? config.url : null;
}

/** Roles the dashboard considers "staff" and willing to import. */
export const STAFF_WP_ROLES = ["administrator", "editor", "author"] as const;
export type StaffWpRole = (typeof STAFF_WP_ROLES)[number];

/** Map a WP role to a dashboard default role on first sync. */
export function wpRoleToDashboardRole(
  wpRoles: readonly string[],
): "admin" | "editor" | "writer" {
  if (wpRoles.includes("administrator")) return "admin";
  if (wpRoles.includes("editor")) return "editor";
  return "writer";
}

/** Is this WP user importable as staff? (Filters out contributors/subscribers.) */
export function isStaffWpUser(wpRoles: readonly string[]): boolean {
  return wpRoles.some((r) => STAFF_WP_ROLES.includes(r as StaffWpRole));
}

export type WpAdminError =
  | { kind: "not_configured"; message: string }
  | { kind: "network"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "unexpected"; status: number; message: string };

export type WpAdminResult<T> = { ok: true; value: T } | { ok: false; error: WpAdminError };

/**
 * Fetch a single WP user by numeric ID with `context=edit`.
 * Requires an application password with edit privileges (administrator).
 */
export async function fetchWpUserById(
  site: WpSiteKey,
  wpUserId: number,
): Promise<WpAdminResult<WpUser>> {
  const auth = adminAuthHeader(site);
  const base = siteBaseUrl(site);
  if (!auth || !base) {
    return {
      ok: false,
      error: {
        kind: "not_configured",
        message: `WordPress ${site.toUpperCase()} is not configured`,
      },
    };
  }

  let response: Response;
  try {
    response = await fetch(`${base}/wp-json/wp/v2/users/${wpUserId}?context=edit`, {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: { kind: "network", message: "Could not reach WordPress" },
    };
  }

  if (response.status === 404) {
    return { ok: false, error: { kind: "not_found", message: "WP user not found" } };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: { kind: "unexpected", status: response.status, message: `WP returned ${response.status}` },
    };
  }

  const data = (await response.json()) as {
    id: number;
    username?: string;
    slug?: string;
    name: string;
    email?: string;
    avatar_urls?: Record<string, string>;
    roles?: string[];
    description?: string;
  };

  return {
    ok: true,
    value: {
      id: data.id,
      username: data.username ?? data.slug ?? "",
      name: data.name,
      email: data.email ?? "",
      avatar_url:
        data.avatar_urls?.["96"] ??
        data.avatar_urls?.["48"] ??
        data.avatar_urls?.["24"] ??
        null,
      wp_roles: data.roles ?? [],
      description: data.description ?? "",
    },
  };
}

/**
 * Fetch a WP user by username (slug). Uses the search parameter.
 */
export async function fetchWpUserByUsername(
  site: WpSiteKey,
  username: string,
): Promise<WpAdminResult<WpUser>> {
  const auth = adminAuthHeader(site);
  const base = siteBaseUrl(site);
  if (!auth || !base) {
    return {
      ok: false,
      error: {
        kind: "not_configured",
        message: `WordPress ${site.toUpperCase()} is not configured`,
      },
    };
  }

  const params = new URLSearchParams({
    slug: username,
    context: "edit",
    per_page: "1",
  });

  let response: Response;
  try {
    response = await fetch(`${base}/wp-json/wp/v2/users?${params.toString()}`, {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: { kind: "network", message: "Could not reach WordPress" },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: { kind: "unexpected", status: response.status, message: `WP returned ${response.status}` },
    };
  }

  const rows = (await response.json()) as Array<{
    id: number;
    username?: string;
    slug?: string;
    name: string;
    email?: string;
    avatar_urls?: Record<string, string>;
    roles?: string[];
    description?: string;
  }>;

  const match = rows[0];
  if (!match) {
    return { ok: false, error: { kind: "not_found", message: "WP user not found" } };
  }

  return {
    ok: true,
    value: {
      id: match.id,
      username: match.username ?? match.slug ?? username,
      name: match.name,
      email: match.email ?? "",
      avatar_url:
        match.avatar_urls?.["96"] ??
        match.avatar_urls?.["48"] ??
        match.avatar_urls?.["24"] ??
        null,
      wp_roles: match.roles ?? [],
      description: match.description ?? "",
    },
  };
}
