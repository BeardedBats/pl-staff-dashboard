import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppSite } from "@/lib/auth/current-user";
import {
  emitStructuredLog,
  safeErrorCode,
} from "@/lib/observability/structured-log";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type AnalyticsFilters = {
  /** ISO date (YYYY-MM-DD) inclusive lower bound. */
  dateFrom: string;
  /** ISO date (YYYY-MM-DD) inclusive upper bound. */
  dateTo: string;
  site?: AppSite;
  tierId?: string;
  categoryId?: string;
  authorId?: string;
};

export type AnalyticsOverview = {
  /** Entries that received at least one pageview or raptive row in range. */
  articlesCount: number;
  totalPageviews: number;
  totalSessions: number;
  /** Total Raptive revenue for the selected site/date range. */
  totalEarnings: number;
  /** Revenue matched to entries included by the current filters. */
  attributedEarnings: number;
  /** Site revenue that could not be attributed to the filtered entries. */
  unattributedEarnings: number;
  attributionRate: number;
  /** Revenue per mille (sessions). */
  avgRpm: number;
  /** Revenue per mille (pageviews) — Raptive's "Page RPM". */
  avgPageRpm: number;
  /** Daily series for sparklines. */
  daily: Array<{
    date: string;
    pageviews: number;
    sessions: number;
    /** Actual matched Raptive revenue recorded on this date. */
    earnings: number;
    /** Actual total Raptive site revenue recorded on this date. */
    siteEarnings: number;
  }>;
};

export type AnalyticsArticleRow = {
  entry_id: string;
  title: string;
  site: AppSite;
  tier_name: string;
  publish_date: string | null;
  pageviews: number;
  sessions: number;
  avg_time_on_page: number;
  earnings: number;
  page_rpm: number;
  authors: string;
};

export type AnalyticsWriterRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  articles: number;
  pageviews: number;
  earnings: number;
  /** Revenue divided by total words across their articles. */
  revenue_per_word: number;
};

export type PublishToPeakPoint = {
  /** Days since publish (0 = publish day, 1 = next day, ...). */
  day: number;
  /** Average pageviews on that day across all articles in range. */
  avgPageviews: number;
  /** How many distinct articles contributed to this bucket. */
  articleCount: number;
};

export type DayOfWeekHeatPoint = {
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number;
  /** ISO week start (YYYY-MM-DD of the Sunday). */
  weekStart: string;
  pageviews: number;
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function logAnalyticsFailure(event: string, error: unknown): void {
  emitStructuredLog({
    level: "error",
    component: "analytics",
    event,
    errorCode: safeErrorCode(error, "query_failed"),
  });
}

function throwAnalyticsFailure(event: string, error: unknown): never {
  logAnalyticsFailure(event, error);
  throw new Error("Analytics data could not be loaded");
}

function analyticsRpcArgs(filters: AnalyticsFilters) {
  return {
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
    p_site: filters.site || undefined,
    p_tier_id: filters.tierId || undefined,
    p_category_id: filters.categoryId || undefined,
    p_author_id: filters.authorId || undefined,
  };
}

// --------------------------------------------------------------------------
// Overview
// --------------------------------------------------------------------------

export async function getAnalyticsOverview(
  filters: AnalyticsFilters,
): Promise<AnalyticsOverview> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc(
    "get_analytics_overview_v2",
    analyticsRpcArgs(filters),
  );
  if (error) throwAnalyticsFailure("overview.load_failed", error);
  if (!data || Array.isArray(data) || typeof data !== "object") {
    throwAnalyticsFailure("overview.invalid_response", "invalid_response");
  }

  const overview = data as unknown as Omit<
    AnalyticsOverview,
    "avgRpm" | "avgPageRpm"
  >;
  return {
    ...overview,
    avgRpm:
      overview.totalSessions > 0
        ? (overview.attributedEarnings / overview.totalSessions) * 1000
        : 0,
    avgPageRpm:
      overview.totalPageviews > 0
        ? (overview.attributedEarnings / overview.totalPageviews) * 1000
        : 0,
  };
}

// --------------------------------------------------------------------------
// Article rollup
// --------------------------------------------------------------------------

export async function getAnalyticsArticles(
  filters: AnalyticsFilters,
): Promise<AnalyticsArticleRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc(
    "get_analytics_articles_v2",
    analyticsRpcArgs(filters),
  );
  if (error) throwAnalyticsFailure("articles.load_failed", error);
  if (!Array.isArray(data)) {
    throwAnalyticsFailure("articles.invalid_response", "invalid_response");
  }
  return data as unknown as AnalyticsArticleRow[];
}

// --------------------------------------------------------------------------
// Writer rollup
// --------------------------------------------------------------------------

export async function getAnalyticsWriters(
  filters: AnalyticsFilters,
): Promise<AnalyticsWriterRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc(
    "get_analytics_writers_v2",
    analyticsRpcArgs(filters),
  );
  if (error) throwAnalyticsFailure("writers.load_failed", error);
  if (!Array.isArray(data)) {
    throwAnalyticsFailure("writers.invalid_response", "invalid_response");
  }
  return data as unknown as AnalyticsWriterRow[];
}

// --------------------------------------------------------------------------
// CSV serialisation (used by export endpoint)
// --------------------------------------------------------------------------

export function articlesToCsv(rows: AnalyticsArticleRow[]): string {
  const header = [
    "Title",
    "Site",
    "Tier",
    "Publish Date",
    "Authors",
    "Pageviews",
    "Sessions",
    "Avg Session Duration (s)",
    "Earnings",
    "Page RPM",
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        esc(r.title),
        esc(r.site.toUpperCase()),
        esc(r.tier_name),
        esc(r.publish_date ?? ""),
        esc(r.authors),
        r.pageviews,
        r.sessions,
        r.avg_time_on_page.toFixed(1),
        r.earnings.toFixed(2),
        r.page_rpm.toFixed(2),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function writersToCsv(rows: AnalyticsWriterRow[]): string {
  const header = [
    "Writer",
    "Articles",
    "Pageviews",
    "Earnings",
    "Revenue / Word",
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        esc(r.display_name),
        r.articles,
        r.pageviews,
        r.earnings.toFixed(2),
        r.revenue_per_word.toFixed(4),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export async function getAnalyticsTrends(
  filters: AnalyticsFilters,
  maxDays = 30,
): Promise<{ curve: PublishToPeakPoint[]; heat: DayOfWeekHeatPoint[] }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("get_analytics_trends_v2", {
    ...analyticsRpcArgs(filters),
    p_max_days: maxDays,
  });
  if (error) throwAnalyticsFailure("trends.load_failed", error);
  if (!data || Array.isArray(data) || typeof data !== "object") {
    throwAnalyticsFailure("trends.invalid_response", "invalid_response");
  }
  const result = data as unknown as {
    curve: PublishToPeakPoint[];
    heat: DayOfWeekHeatPoint[];
  };
  if (!Array.isArray(result.curve) || !Array.isArray(result.heat)) {
    throwAnalyticsFailure("trends.invalid_response", "invalid_response");
  }
  return result;
}
