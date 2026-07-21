export type AnalyticsUrlRecord = {
  id: string;
  url: string | null;
};

/**
 * Reduce an absolute URL, protocol-relative URL, or GA4/Raptive path to the
 * hostless article path used to join analytics rows to entries.
 */
export function normalizeAnalyticsPath(raw: string): string {
  const value = raw.trim();
  if (!value) return "";

  let pathname: string;
  try {
    if (/^https?:\/\//i.test(value)) {
      pathname = new URL(value).pathname;
    } else if (value.startsWith("//")) {
      pathname = new URL(`https:${value}`).pathname;
    } else if (/^(?:www\.)?[^/?#]+\.[^/?#]+(?:[/?#]|$)/i.test(value)) {
      pathname = new URL(`https://${value}`).pathname;
    } else {
      pathname = new URL(
        value.startsWith("/") ? value : `/${value}`,
        "https://analytics-path.invalid",
      ).pathname;
    }
  } catch {
    pathname = value.split(/[?#]/, 1)[0] ?? "";
  }

  try {
    pathname = decodeURI(pathname);
  } catch {
    // Keep malformed percent escapes stable instead of rejecting an import.
  }

  return pathname.toLowerCase().replace(/^\/+|\/+$/g, "");
}

/**
 * Build an article-path index without silently assigning an ambiguous path to
 * whichever entry happened to be read last.
 */
export function buildAnalyticsPathIndex(
  records: Iterable<AnalyticsUrlRecord>,
): Map<string, string> {
  const index = new Map<string, string>();

  for (const record of records) {
    if (!record.url) continue;
    const path = normalizeAnalyticsPath(record.url);
    if (!path) continue;

    const existing = index.get(path);
    if (existing && existing !== record.id) {
      throw new Error(
        "Multiple entries share the same analytics path; import stopped to prevent misattribution",
      );
    }
    index.set(path, record.id);
  }

  return index;
}
