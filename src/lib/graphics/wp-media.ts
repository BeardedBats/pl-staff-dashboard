import "server-only";

import {
  getWordPressSiteConfig,
  wordPressBasicAuth,
  type WpSiteKey,
} from "@/lib/wordpress/config";
import { sanitizeFilename } from "@/lib/graphics/storage";

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
  const config = getWordPressSiteConfig(site);
  if (!config) {
    return {
      ok: false,
      error: `WordPress ${site.toUpperCase()} is not configured`,
    };
  }
  const safeFileName = sanitizeFilename(params.fileName).replace(
    /["\r\n]/g,
    "-",
  );

  let response: Response;
  try {
    response = await fetch(`${config.url}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: wordPressBasicAuth(
          config.appUsername,
          config.appPassword,
        ),
        "Content-Type": params.mimeType,
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
      },
      // Node's fetch accepts ArrayBuffer as body.
      body: params.bytes,
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach WordPress. Try again in a moment.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `WordPress media upload failed (${response.status})`,
    };
  }

  let data: { id?: unknown; source_url?: unknown };
  try {
    data = (await response.json()) as { id?: unknown; source_url?: unknown };
  } catch {
    return { ok: false, error: "WordPress returned an invalid media response" };
  }
  if (
    !Number.isInteger(data.id) ||
    (data.id as number) < 1 ||
    typeof data.source_url !== "string"
  ) {
    return { ok: false, error: "WordPress returned an invalid media response" };
  }

  return {
    ok: true,
    media: {
      mediaId: data.id as number,
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
  if (
    !Number.isInteger(wpPostId) ||
    wpPostId < 1 ||
    !Number.isInteger(mediaId) ||
    mediaId < 1
  ) {
    return { ok: false, error: "Invalid WordPress post or media ID" };
  }
  const config = getWordPressSiteConfig(site);
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
        Authorization: wordPressBasicAuth(
          config.appUsername,
          config.appPassword,
        ),
        Accept: "application/json",
      },
      body: JSON.stringify({ featured_media: mediaId }),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach WordPress. Try again in a moment.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `WordPress featured-image update failed (${response.status})`,
    };
  }

  return { ok: true };
}
