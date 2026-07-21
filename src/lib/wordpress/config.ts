import "server-only";

import { env } from "@/lib/env";

export type WpSiteKey = "pl" | "qb";

export type WordPressSiteConfig = {
  url: string;
  appUsername: string;
  appPassword: string;
};

export function normalizeWordPressBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export function getWordPressSiteConfig(
  site: WpSiteKey,
): WordPressSiteConfig | null {
  if (site === "pl") {
    if (!env.WP_PL_URL || !env.WP_PL_USERNAME || !env.WP_PL_APP_PASSWORD) {
      return null;
    }
    return {
      url: normalizeWordPressBaseUrl(env.WP_PL_URL),
      appUsername: env.WP_PL_USERNAME,
      appPassword: env.WP_PL_APP_PASSWORD,
    };
  }

  if (!env.WP_QB_URL || !env.WP_QB_USERNAME || !env.WP_QB_APP_PASSWORD) {
    return null;
  }
  return {
    url: normalizeWordPressBaseUrl(env.WP_QB_URL),
    appUsername: env.WP_QB_USERNAME,
    appPassword: env.WP_QB_APP_PASSWORD,
  };
}

/** Encode WordPress application-password credentials for HTTP Basic auth. */
export function wordPressBasicAuth(username: string, password: string): string {
  const normalizedPassword = password.replace(/\s+/g, "");
  return `Basic ${Buffer.from(`${username}:${normalizedPassword}`).toString("base64")}`;
}
