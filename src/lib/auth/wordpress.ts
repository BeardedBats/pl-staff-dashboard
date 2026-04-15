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
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "network",
        message: err instanceof Error ? err.message : "Network error",
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
