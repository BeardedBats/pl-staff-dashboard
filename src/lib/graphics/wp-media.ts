import "server-only";

import { env } from "@/lib/env";
import type { WpSiteKey } from "@/lib/auth/wordpress";

/**
 * WordPress media library helpers.
 *
 * Two ops:
 *   1. uploadMediaToWp — POST the raw image bytes to /wp-json/wp/v2/media.
 *      We use the Content-Disposition header pattern (not multipart) because
 *      it's simpler to construct from Node fetch and works cleanly with
 *      WP's media endpoint.
 *   2. setFeaturedMedia — PATCH the post to set featured_media = mediaId.
 *      WP REST expects POST (update uses POST) with a JSON body.
 */

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

function basicAuth(username: string, password: string): string {
  const normalized = password.replace(/\s+/g, "");
  return "Basic " + Buffer.from(`${username}:${normalized}`).toString("base64");
}

// --------------------------------------------------------------------------
// Upload bytes to WP media library
// --------------------------------------------------------------------------

export type WpMediaUpload = {
  mediaId: number;
  sourceUrl: string;
};

export async function uploadMediaToWp(
  site: WpSiteKey,
  params: {
    fileName: string;
    mimeType: string;
    bytes: ArrayBuffer;
  },
): Promise<{ ok: true; media: WpMediaUpload } | { ok: false; error: string }> {
  const config = getSiteConfig(site);
  if (!config) {
    return {
      ok: false,
      error: `WordPress ${site.toUpperCase()} is not configured`,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(config.appUsername, config.appPassword),
        "Content-Type": params.mimeType,
        "Content-Disposition": `attachment; filename="${params.fileName}"`,
      },
      // Node's fetch accepts ArrayBuffer as body.
      body: params.bytes,
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: `WP media upload failed (${response.status}): ${text.slice(0, 250)}`,
    };
  }

  const data = (await response.json()) as {
    id: number;
    source_url: string;
  };

  return {
    ok: true,
    media: {
      mediaId: data.id,
      sourceUrl: data.source_url,
    },
  };
}

// --------------------------------------------------------------------------
// Set as featured image on a post
// --------------------------------------------------------------------------

export async function setFeaturedMedia(
  site: WpSiteKey,
  wpPostId: number,
  mediaId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = getSiteConfig(site);
  if (!config) {
    return {
      ok: false,
      error: `WordPress ${site.toUpperCase()} is not configured`,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/wp-json/wp/v2/posts/${wpPostId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth(config.appUsername, config.appPassword),
        Accept: "application/json",
      },
      body: JSON.stringify({ featured_media: mediaId }),
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: `WP featured image set failed (${response.status}): ${text.slice(0, 250)}`,
    };
  }

  return { ok: true };
}
