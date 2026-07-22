export type WpPageResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; error: string };

/**
 * Fetch every page of a WordPress collection as one reconciliation snapshot.
 * A later-page failure discards earlier rows so callers never mutate local
 * state from a partial remote view.
 */
export async function fetchAllWpPages<T>(input: {
  urlForPage: (page: number) => string;
  headers: Record<string, string>;
}): Promise<WpPageResult<T>> {
  const rows: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    let response: Response;
    try {
      response = await fetch(input.urlForPage(page), {
        headers: input.headers,
        cache: "no-store",
      });
    } catch {
      return { ok: false, error: "Could not reach WordPress" };
    }

    if (!response.ok) {
      return { ok: false, error: `WP returned ${response.status}` };
    }

    let pageRows: unknown;
    try {
      pageRows = await response.json();
    } catch {
      return { ok: false, error: "WordPress returned an invalid response" };
    }
    if (!Array.isArray(pageRows)) {
      return { ok: false, error: "WordPress returned an invalid response" };
    }

    const totalHeader = response.headers.get("x-wp-totalpages");
    if (totalHeader) {
      const parsed = Number.parseInt(totalHeader, 10);
      if (Number.isFinite(parsed) && parsed > 0) totalPages = parsed;
    }

    rows.push(...(pageRows as T[]));
    page += 1;
  } while (page <= totalPages);

  return { ok: true, rows };
}
