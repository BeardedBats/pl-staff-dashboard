import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { hasRoleForSite } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findSystemUserId } from "@/lib/recurring-templates/generator";
import {
  getWordPressSiteConfig,
  wordPressBasicAuth,
  type WpSiteKey,
} from "@/lib/wordpress/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Worst-case pulls thousands of posts per site at 100/page across two sites.
// Vercel hobby caps at 60s; the per-page WP latency is the bottleneck so we
// take the full minute.
export const maxDuration = 300;

/**
 * POST /api/admin/historical-import
 *
 * One-time (but idempotent) import of all published WordPress posts from
 * October 1 2022 onward. Brings pre-existing articles into `entries` so
 * the analytics joins (GA4 pagePath, Raptive page_url) can attach traffic
 * and revenue data via wp_post_url.
 *
 * Imported entries are flagged `is_historical = true` so they stay out of
 * the active pipeline (content table, editing queue, calendar, unclaimed
 * alerts) while still being visible to analytics queries.
 *
 * Idempotent: re-running skips any (wp_post_id, site) pair that's already
 * in the entries table — safe to retry after a partial run.
 *
 * Auth: Operations role only.
 */

const HISTORICAL_CUTOFF_ISO = "2022-09-30T23:59:59";

type SiteKey = WpSiteKey;

const bodySchema = z.object({
  site: z.enum(["pl", "qb", "both"]),
  dry_run: z.boolean().optional().default(false),
  start_page: z.number().int().positive().optional().default(1),
  max_pages: z.number().int().positive().optional().default(20),
});

type WpHistoricalPost = {
  id: number;
  date: string | null;
  modified: string | null;
  link: string | null;
  author: number;
  status: string;
  title:
    | { rendered?: string; raw?: string }
    | string
    | null
    | undefined;
  categories: number[] | null;
};

function pickTitle(post: WpHistoricalPost): string {
  const t = post.title;
  let raw: string;
  if (!t) {
    raw = "Untitled";
  } else if (typeof t === "string") {
    raw = t.length > 0 ? t : "Untitled";
  } else if (typeof t.rendered === "string" && t.rendered.length > 0) {
    raw = t.rendered;
  } else if (typeof t.raw === "string" && t.raw.length > 0) {
    raw = t.raw;
  } else {
    raw = "Untitled";
  }
  // WP's `rendered` title contains HTML entities (e.g. &#8217;) and
  // occasionally inline tags. A light decode is enough — these are post
  // titles, not full HTML bodies.
  return decodeWpEntities(stripHtml(raw)).trim() || "Untitled";
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, "");
}

function decodeWpEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    });
}

type SiteReport = {
  site: SiteKey;
  postsFound: number;
  postsImported: number;
  postsSkipped: number;
  authorsMatched: number;
  authorsUnmatched: number;
  categoriesMatched: number;
  errors: string[];
  pagesProcessed: number;
  hasMore: boolean;
};

function emptyReport(site: SiteKey): SiteReport {
  return {
    site,
    postsFound: 0,
    postsImported: 0,
    postsSkipped: 0,
    authorsMatched: 0,
    authorsUnmatched: 0,
    categoriesMatched: 0,
    errors: [],
    pagesProcessed: 0,
    hasMore: false,
  };
}

async function importSite(
  site: SiteKey,
  dryRun: boolean,
  systemUserId: string,
  startPage: number,
  maxPages: number,
): Promise<SiteReport> {
  const report = emptyReport(site);
  const config = getWordPressSiteConfig(site);
  if (!config) {
    report.errors.push(`WordPress ${site.toUpperCase()} not configured`);
    return report;
  }

  const supabase = getSupabaseAdmin();

  // Default tier for historical entries. We don't know the real tier so we
  // pick whatever fallback the rest of the codebase uses ("A" or "C").
  const { data: tierA } = await supabase
    .from("tiers")
    .select("id")
    .eq("name", "A")
    .maybeSingle();
  const { data: tierC } = await supabase
    .from("tiers")
    .select("id")
    .eq("name", "C")
    .maybeSingle();
  const defaultTierId =
    (tierA?.id as string | undefined) ??
    (tierC?.id as string | undefined) ??
    null;
  if (!defaultTierId) {
    report.errors.push("No default tier found (need 'A' or 'C' in tiers table)");
    return report;
  }

  const endPage = startPage + maxPages - 1;
  let page = startPage;
  // We assume more pages exist until we see proof otherwise (a short page,
  // an empty page, or a 400 past-the-end). hasMore flips to true if we
  // exhaust the chunk without that proof.
  let hitEndOfData = false;

  while (page <= endPage) {
    const params = new URLSearchParams({
      status: "publish",
      after: HISTORICAL_CUTOFF_ISO,
      per_page: "100",
      page: String(page),
      orderby: "date",
      order: "asc",
      context: "edit",
      _fields: "id,date,modified,link,author,title,categories,status",
    });

    let response: Response;
    try {
      response = await fetch(
        `${config.url}/wp-json/wp/v2/posts?${params.toString()}`,
        {
          headers: {
            Authorization: wordPressBasicAuth(
              config.appUsername,
              config.appPassword,
            ),
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );
    } catch {
      report.errors.push(`Page ${page} could not be fetched from WordPress`);
      break;
    }

    if (!response.ok) {
      // WP returns 400 with `rest_post_invalid_page_number` past the end.
      if (response.status === 400) {
        hitEndOfData = true;
        break;
      }
      report.errors.push(
        `Page ${page} returned WordPress status ${response.status}`,
      );
      break;
    }

    let posts: WpHistoricalPost[];
    try {
      posts = (await response.json()) as WpHistoricalPost[];
    } catch {
      report.errors.push(`Page ${page} returned an invalid WordPress response`);
      break;
    }

    if (!Array.isArray(posts) || posts.length === 0) {
      hitEndOfData = true;
      break;
    }

    report.postsFound += posts.length;
    report.pagesProcessed++;

    if (!dryRun) {
      for (const post of posts) {
        try {
          await importOnePost(site, post, defaultTierId, systemUserId, report);
        } catch {
          report.errors.push(`Post ${post.id} could not be imported`);
        }
      }
    }

    if (posts.length < 100) {
      hitEndOfData = true;
      break;
    }

    page++;
    if (page > endPage) break;

    // 50ms between pages — gentle on the WP REST API. Per-post delays
    // would balloon the total time without meaningfully reducing load.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  report.hasMore = !hitEndOfData;
  return report;
}

async function importOnePost(
  site: SiteKey,
  post: WpHistoricalPost,
  defaultTierId: string,
  systemUserId: string,
  report: SiteReport,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Idempotency check — keyed on (wp_post_id, site).
  const { data: existing } = await supabase
    .from("entries")
    .select("id")
    .eq("wp_post_id", post.id)
    .eq("site", site)
    .maybeSingle();

  if (existing?.id) {
    const { data: author, error: authorError } = await supabase.from("users")
      .select("id").eq("wp_user_id", post.author).in("wp_site", [site, "both"]).maybeSingle();
    if (authorError) throw authorError;
    if (author) {
      const { data: links, error: linksError } = await supabase.from("entry_authors")
        .select("user_id").eq("entry_id", existing.id).eq("role", "primary");
      if (linksError) throw linksError;
      // Preserve intentional staff assignments. Repair only an absent primary author.
      if (!links?.length) {
        const { error } = await supabase.from("entry_authors").upsert({
          entry_id: existing.id, user_id: author.id, role: "primary",
        }, { onConflict: "entry_id,user_id", ignoreDuplicates: true });
        if (error) throw error;
        report.authorsMatched++;
      }
    }
    report.postsSkipped++;
    return;
  }

  // Match WP author to a dashboard user. Users with wp_site='both' write
  // for either site, so they must match regardless of which import is
  // running. We DO need a created_by to satisfy the FK, so fall back to
  // systemUserId when no dashboard user matches the WP author.
  const { data: userMatch } = await supabase
    .from("users")
    .select("id, wp_site")
    .eq("wp_user_id", post.author)
    .in("wp_site", [site, "both"])
    .maybeSingle();

  const dashboardUserId = (userMatch?.id as string | null) ?? null;
  if (dashboardUserId) {
    report.authorsMatched++;
  } else {
    report.authorsUnmatched++;
  }

  // Categories — pick the first matched category as the entry's
  // category. Unmatched IDs are skipped silently (they're usually WP-only
  // taxonomy noise that the dashboard doesn't care about).
  let categoryId: string | null = null;
  if (Array.isArray(post.categories) && post.categories.length > 0) {
    const { data: catRows } = await supabase
      .from("categories")
      .select("id, wp_category_id")
      .eq("site", site)
      .in("wp_category_id", post.categories);
    const cats = (catRows ?? []) as Array<{
      id: string;
      wp_category_id: number;
    }>;
    if (cats.length > 0) {
      // Preserve the order of post.categories so the "primary" category
      // (the first one set on the WP post) wins.
      for (const wpCatId of post.categories) {
        const hit = cats.find((c) => c.wp_category_id === wpCatId);
        if (hit) {
          categoryId = hit.id;
          break;
        }
      }
      report.categoriesMatched++;
    }
  }

  const publishDateIso = post.date ? new Date(post.date).toISOString() : null;
  const modifiedIso = post.modified ? new Date(post.modified).toISOString() : null;

  const { data: inserted, error: insertError } = await supabase
    .from("entries")
    .insert({
      title: pickTitle(post),
      site,
      tier_id: defaultTierId,
      category_id: categoryId,
      wp_post_id: post.id,
      wp_post_url: post.link ?? null,
      wp_status: "publish",
      wp_modified_at: modifiedIso,
      content_status: "published",
      editor_status: "published",
      publish_date: publishDateIso,
      publish_date_precision: publishDateIso ? "exact" : "none",
      published_at: publishDateIso,
      is_historical: true,
      created_by: dashboardUserId ?? systemUserId,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    report.errors.push(`Post ${post.id} insert failed: ${insertError?.message ?? "unknown"}`);
    return;
  }

  // Attach author row only when we found a real dashboard user. Skipping
  // the row keeps "My active claims" etc. from showing ghost entries
  // attributed to the system fallback user.
  if (dashboardUserId) {
    const { error: authorError } = await supabase.from("entry_authors").insert({
      entry_id: inserted.id as string,
      user_id: dashboardUserId,
      role: "primary",
    });
    if (authorError) throw authorError;
  }

  report.postsImported++;
}

export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isOperations(viewer)) {
    return errorResponse(403, "Only Operations can run the historical import");
  }

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const {
    site: requestedSite,
    dry_run: dryRun,
    start_page: startPage,
    max_pages: maxPages,
  } = parsed.data;

  const systemUserId = await findSystemUserId();
  if (!systemUserId) {
    return errorResponse(
      500,
      "No admin user found to attribute imported entries to.",
    );
  }

  const sites: SiteKey[] = (() => {
    if (requestedSite === "both") {
      const out: SiteKey[] = ["pl"];
      if (getWordPressSiteConfig("qb")) out.push("qb");
      return out;
    }
    return [requestedSite];
  })();
  if (sites.some((site) => !hasRoleForSite(viewer, site, "operations"))) {
    return errorResponse(
      403,
      "Operations access is required for every requested site",
    );
  }

  const reports: SiteReport[] = [];
  for (const s of sites) {
    reports.push(await importSite(s, dryRun, systemUserId, startPage, maxPages));
  }

  // Collapse for the response — UI shows per-site breakdown.
  const totals = reports.reduce(
    (acc, r) => ({
      postsFound: acc.postsFound + r.postsFound,
      postsImported: acc.postsImported + r.postsImported,
      postsSkipped: acc.postsSkipped + r.postsSkipped,
      authorsMatched: acc.authorsMatched + r.authorsMatched,
      authorsUnmatched: acc.authorsUnmatched + r.authorsUnmatched,
      categoriesMatched: acc.categoriesMatched + r.categoriesMatched,
      errors: acc.errors.concat(r.errors),
    }),
    {
      postsFound: 0,
      postsImported: 0,
      postsSkipped: 0,
      authorsMatched: 0,
      authorsUnmatched: 0,
      categoriesMatched: 0,
      errors: [] as string[],
    },
  );

  // Sites paginate in lockstep on shared start_page/max_pages — if any site
  // could still have more pages past this chunk, the UI needs to loop again.
  const anyHasMore = reports.some((r) => r.hasMore);
  const nextPage = anyHasMore ? startPage + maxPages : null;
  const totalPagesProcessed = Math.max(
    0,
    ...reports.map((r) => r.pagesProcessed),
  );
  let raptiveRowsMatched = 0;
  if (!dryRun && !anyHasMore) {
    const { data, error } = await getSupabaseAdmin().rpc(
      "reconcile_raptive_entry_links",
    );
    if (error) {
      return errorResponse(
        502,
        "Articles were imported, but Raptive reconciliation failed. Retry this import safely.",
      );
    }
    raptiveRowsMatched = Number(
      (data as { liveRowsMatched?: number } | null)?.liveRowsMatched ?? 0,
    );
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    site: requestedSite,
    note: dryRun
      ? "Dry run — no rows were written. postsFound is the count that would be imported (minus any already-imported entries, which still show in postsSkipped during a real run)."
      : null,
    reports,
    totals,
    nextPage,
    totalPagesProcessed,
    raptiveRowsMatched,
  });
}
