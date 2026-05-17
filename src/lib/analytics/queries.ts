import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppSite } from "@/lib/auth/current-user";

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
  totalEarnings: number;
  /** Revenue per mille (sessions). */
  avgRpm: number;
  /** Revenue per mille (pageviews) — Raptive's "Page RPM". */
  avgPageRpm: number;
  /** Daily series for sparklines. */
  daily: Array<{
    date: string;
    pageviews: number;
    earnings: number;
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

type EntryRow = {
  id: string;
  title: string;
  site: AppSite;
  tier_id: string;
  publish_date: string | null;
  word_count: number;
  category_id: string | null;
  is_archived: boolean;
};

async function loadEntriesForRange(
  filters: AnalyticsFilters,
): Promise<Map<string, EntryRow>> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("entries")
    .select(
      "id, title, site, tier_id, publish_date, word_count, category_id, is_archived",
    )
    .eq("is_archived", false)
    .limit(10000);

  // Keep any entry that was published on/before dateTo — we don't filter by
  // publish_date on the lower bound because an older article can still
  // accumulate pageviews during the filter window.
  if (filters.site) q = q.eq("site", filters.site);
  if (filters.tierId) q = q.eq("tier_id", filters.tierId);
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId);

  const { data, error } = await q;
  if (error) console.error("[analytics] loadEntriesForRange failed:", error.message);
  const rows = (data ?? []) as unknown as EntryRow[];

  const map = new Map<string, EntryRow>();
  for (const r of rows) map.set(r.id, r);
  return map;
}

async function loadGa4Rows(
  filters: AnalyticsFilters,
): Promise<
  Array<{
    entry_id: string;
    date: string;
    pageviews: number;
    sessions: number;
    avg_time_on_page: number;
  }>
> {
  // Query by date only. The previous implementation filtered by entry_id
  // with `.in(...)` on potentially thousands of UUIDs, which blew past
  // PostgREST's URL length limit and silently returned []. Callers now
  // filter the result set in memory against their own entry set.
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("article_analytics")
    .select("entry_id, date, pageviews, sessions, avg_time_on_page")
    .gte("date", filters.dateFrom)
    .lte("date", filters.dateTo)
    .limit(500000);
  if (error) console.error("[analytics] loadGa4Rows failed:", error.message);

  return (data ?? []) as unknown as Array<{
    entry_id: string;
    date: string;
    pageviews: number;
    sessions: number;
    avg_time_on_page: number;
  }>;
}

async function loadRaptiveRows(
  filters: AnalyticsFilters,
): Promise<
  Array<{
    entry_id: string | null;
    date: string;
    page_url: string;
    earnings: number;
    rpm: number;
    page_rpm: number;
    sessions: number;
    pageviews: number;
  }>
> {
  const supabase = getSupabaseAdmin();
  // Query by date only. Raptive rows may not have an entry_id (unmatched);
  // callers decide whether to keep unmatched rows. As with loadGa4Rows,
  // filtering by `.in("entry_id", entryIds)` on large entry sets exceeded
  // PostgREST's URL length limit and silently returned []. Callers now
  // filter in memory.
  const { data, error } = await supabase
    .from("raptive_revenue")
    .select(
      "entry_id, date, page_url, earnings, rpm, page_rpm, sessions, pageviews",
    )
    .gte("date", filters.dateFrom)
    .lte("date", filters.dateTo)
    .limit(500000);
  if (error) console.error("[analytics] loadRaptiveRows failed:", error.message);

  return (data ?? []) as unknown as Array<{
    entry_id: string | null;
    date: string;
    page_url: string;
    earnings: number;
    rpm: number;
    page_rpm: number;
    sessions: number;
    pageviews: number;
  }>;
}

async function loadEntryAuthors(
  entryIds: string[],
): Promise<Map<string, Array<{ user_id: string; display_name: string; avatar_url: string | null; word_count: number; role: string }>>> {
  if (entryIds.length === 0) return new Map();
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("entry_authors")
    .select(
      "entry_id, role, user_id, users!inner(id, display_name, avatar_url)",
    )
    .in("entry_id", entryIds);

  const rows = (data ?? []) as unknown as Array<{
    entry_id: string;
    role: string;
    user_id: string;
    users: { id: string; display_name: string; avatar_url: string | null };
  }>;

  const map = new Map<
    string,
    Array<{ user_id: string; display_name: string; avatar_url: string | null; word_count: number; role: string }>
  >();
  for (const r of rows) {
    const arr = map.get(r.entry_id) ?? [];
    arr.push({
      user_id: r.user_id,
      display_name: r.users.display_name,
      avatar_url: r.users.avatar_url,
      word_count: 0,
      role: r.role,
    });
    map.set(r.entry_id, arr);
  }
  return map;
}

// --------------------------------------------------------------------------
// Overview
// --------------------------------------------------------------------------

export async function getAnalyticsOverview(
  filters: AnalyticsFilters,
): Promise<AnalyticsOverview> {
  // Inverted query order: fetch GA4 + Raptive by date range first (both are
  // already bounded by the date window — typically a few hundred rows), then
  // look up matching entries. The old "entries → GA4 by entry_id" path passed
  // 7,000+ UUIDs to `.in(...)`, exceeded PostgREST's URL length limit, and
  // returned [] silently — which surfaced as zeros on the analytics page.
  const [allGa4Rows, allRaptiveRows] = await Promise.all([
    loadGa4Rows(filters),
    loadRaptiveRows(filters),
  ]);

  // Collect every entry_id observed in this date window. This set is small
  // (bounded by daily article volume × days) so `.in(...)` is safe here.
  const observedEntryIds = new Set<string>();
  for (const r of allGa4Rows) observedEntryIds.add(r.entry_id);
  for (const r of allRaptiveRows) if (r.entry_id) observedEntryIds.add(r.entry_id);

  // Look up entries for those IDs, applying site/tier/category filters.
  const supabase = getSupabaseAdmin();
  const entries = new Map<string, EntryRow>();
  if (observedEntryIds.size > 0) {
    let q = supabase
      .from("entries")
      .select(
        "id, title, site, tier_id, publish_date, word_count, category_id, is_archived",
      )
      .eq("is_archived", false)
      .in("id", Array.from(observedEntryIds));
    if (filters.site) q = q.eq("site", filters.site);
    if (filters.tierId) q = q.eq("tier_id", filters.tierId);
    if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
    const { data, error } = await q;
    if (error)
      console.error("[analytics] entries lookup failed:", error.message);
    for (const r of (data ?? []) as unknown as EntryRow[]) entries.set(r.id, r);
  }

  // Author filter — restrict to entries this user authored.
  let authoredEntryIds: Set<string> | null = null;
  if (filters.authorId) {
    const { data, error } = await supabase
      .from("entry_authors")
      .select("entry_id")
      .eq("user_id", filters.authorId);
    if (error)
      console.error("[analytics] author lookup failed:", error.message);
    authoredEntryIds = new Set(
      ((data ?? []) as Array<{ entry_id: string }>).map((r) => r.entry_id),
    );
  }

  // Entries that pass every filter — used to filter GA4 and Raptive rows.
  const matchingEntryIds = new Set<string>();
  for (const id of entries.keys()) {
    if (authoredEntryIds && !authoredEntryIds.has(id)) continue;
    matchingEntryIds.add(id);
  }

  // For Raptive: when no entry-scoped filter is active, keep unmatched rows
  // (null entry_id) so overall revenue is preserved — matches the original
  // behavior of loadRaptiveRows.
  const hasEntryFilter = !!(
    filters.site ||
    filters.tierId ||
    filters.categoryId ||
    filters.authorId
  );
  const ga4Rows = allGa4Rows.filter((r) => matchingEntryIds.has(r.entry_id));
  const raptiveRows = allRaptiveRows.filter((r) => {
    if (hasEntryFilter) {
      return r.entry_id != null && matchingEntryIds.has(r.entry_id);
    }
    return true;
  });

  // Aggregate
  const daily = new Map<string, { pageviews: number; earnings: number }>();
  let totalPageviews = 0;
  let totalSessions = 0;
  let totalEarnings = 0;

  for (const r of ga4Rows) {
    totalPageviews += r.pageviews;
    totalSessions += r.sessions;
    const bucket = daily.get(r.date) ?? { pageviews: 0, earnings: 0 };
    bucket.pageviews += r.pageviews;
    daily.set(r.date, bucket);
  }
  for (const r of raptiveRows) {
    totalEarnings += Number(r.earnings) || 0;
    // Raptive also reports pageviews/sessions — if we have no GA4 data yet,
    // these keep the overview populated. If we have both, GA4 wins (it's
    // more granular) and we don't double-count.
    if (ga4Rows.length === 0) {
      totalPageviews += r.pageviews;
      totalSessions += r.sessions;
      const bucket = daily.get(r.date) ?? { pageviews: 0, earnings: 0 };
      bucket.pageviews += r.pageviews;
      bucket.earnings += Number(r.earnings) || 0;
      daily.set(r.date, bucket);
    } else {
      const bucket = daily.get(r.date) ?? { pageviews: 0, earnings: 0 };
      bucket.earnings += Number(r.earnings) || 0;
      daily.set(r.date, bucket);
    }
  }

  // Count distinct entries that saw traffic or revenue
  const seenEntries = new Set<string>();
  for (const r of ga4Rows) seenEntries.add(r.entry_id);
  for (const r of raptiveRows) if (r.entry_id) seenEntries.add(r.entry_id);

  const avgRpm = totalSessions > 0 ? (totalEarnings / totalSessions) * 1000 : 0;
  const avgPageRpm =
    totalPageviews > 0 ? (totalEarnings / totalPageviews) * 1000 : 0;

  const dailySeries = Array.from(daily.entries())
    .map(([date, v]) => ({ date, pageviews: v.pageviews, earnings: v.earnings }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    articlesCount: seenEntries.size,
    totalPageviews,
    totalSessions,
    totalEarnings,
    avgRpm,
    avgPageRpm,
    daily: dailySeries,
  };
}

// --------------------------------------------------------------------------
// Article rollup
// --------------------------------------------------------------------------

export async function getAnalyticsArticles(
  filters: AnalyticsFilters,
): Promise<AnalyticsArticleRow[]> {
  const entries = await loadEntriesForRange(filters);
  const entryIds = Array.from(entries.keys());

  // Authors (for filter + display)
  const authors = await loadEntryAuthors(entryIds);

  // Author filter
  let filteredEntryIds = entryIds;
  if (filters.authorId) {
    filteredEntryIds = entryIds.filter((id) =>
      (authors.get(id) ?? []).some((a) => a.user_id === filters.authorId),
    );
  }

  // Tiers — single lookup
  const supabase = getSupabaseAdmin();
  const { data: tierRows } = await supabase
    .from("tiers")
    .select("id, name");
  const tierMap = new Map<string, string>();
  for (const t of (tierRows ?? []) as Array<{ id: string; name: string }>) {
    tierMap.set(t.id, t.name);
  }

  const [allGa4Rows, allRaptiveRows] = await Promise.all([
    loadGa4Rows(filters),
    loadRaptiveRows(filters),
  ]);

  // Filter in memory — the helpers used to do `.in("entry_id", entryIds)`
  // but that exceeded PostgREST's URL length on large entry sets.
  const filteredSet = new Set(filteredEntryIds);
  const ga4Rows = allGa4Rows.filter((r) => filteredSet.has(r.entry_id));
  const raptiveRows = allRaptiveRows.filter(
    (r) => r.entry_id != null && filteredSet.has(r.entry_id),
  );

  type Agg = {
    pageviews: number;
    sessions: number;
    timeSum: number;
    timeCount: number;
    earnings: number;
  };
  const agg = new Map<string, Agg>();

  for (const r of ga4Rows) {
    const b = agg.get(r.entry_id) ?? {
      pageviews: 0,
      sessions: 0,
      timeSum: 0,
      timeCount: 0,
      earnings: 0,
    };
    b.pageviews += r.pageviews;
    b.sessions += r.sessions;
    if (r.avg_time_on_page) {
      b.timeSum += r.avg_time_on_page * r.pageviews;
      b.timeCount += r.pageviews;
    }
    agg.set(r.entry_id, b);
  }
  for (const r of raptiveRows) {
    if (!r.entry_id) continue;
    const b = agg.get(r.entry_id) ?? {
      pageviews: 0,
      sessions: 0,
      timeSum: 0,
      timeCount: 0,
      earnings: 0,
    };
    b.earnings += Number(r.earnings) || 0;
    // Only bump pageviews/sessions from Raptive if we don't have GA4 for
    // this article (avoid double-counting).
    if (b.pageviews === 0) {
      b.pageviews += r.pageviews;
      b.sessions += r.sessions;
    }
    agg.set(r.entry_id, b);
  }

  const out: AnalyticsArticleRow[] = [];
  for (const entryId of filteredEntryIds) {
    const a = agg.get(entryId);
    if (!a) continue;
    const entry = entries.get(entryId);
    if (!entry) continue;
    const ents = authors.get(entryId) ?? [];
    out.push({
      entry_id: entryId,
      title: entry.title,
      site: entry.site,
      tier_name: tierMap.get(entry.tier_id) ?? "?",
      publish_date: entry.publish_date,
      pageviews: a.pageviews,
      sessions: a.sessions,
      avg_time_on_page: a.timeCount > 0 ? a.timeSum / a.timeCount : 0,
      earnings: a.earnings,
      page_rpm: a.pageviews > 0 ? (a.earnings / a.pageviews) * 1000 : 0,
      authors: ents.map((e) => e.display_name).join(", ") || "—",
    });
  }

  out.sort((a, b) => b.earnings - a.earnings);
  return out;
}

// --------------------------------------------------------------------------
// Writer rollup
// --------------------------------------------------------------------------

export async function getAnalyticsWriters(
  filters: AnalyticsFilters,
): Promise<AnalyticsWriterRow[]> {
  const entries = await loadEntriesForRange(filters);
  const entryIds = Array.from(entries.keys());

  // word_count lives on the entry record
  const wordCounts = new Map<string, number>();
  for (const [id, e] of entries) wordCounts.set(id, e.word_count ?? 0);

  const authors = await loadEntryAuthors(entryIds);

  const [allGa4Rows, allRaptiveRows] = await Promise.all([
    loadGa4Rows(filters),
    loadRaptiveRows(filters),
  ]);

  // Filter in memory against this rollup's entry set.
  const entrySet = new Set(entryIds);
  const ga4Rows = allGa4Rows.filter((r) => entrySet.has(r.entry_id));
  const raptiveRows = allRaptiveRows.filter(
    (r) => r.entry_id != null && entrySet.has(r.entry_id),
  );

  type Agg = {
    display_name: string;
    avatar_url: string | null;
    articleSet: Set<string>;
    pageviews: number;
    earnings: number;
    words: number;
  };
  const byUser = new Map<string, Agg>();

  for (const [entryId, authorList] of authors.entries()) {
    for (const author of authorList) {
      // Only primary authors count toward rollups
      if (author.role !== "primary") continue;
      const b = byUser.get(author.user_id) ?? {
        display_name: author.display_name,
        avatar_url: author.avatar_url,
        articleSet: new Set<string>(),
        pageviews: 0,
        earnings: 0,
        words: 0,
      };
      b.articleSet.add(entryId);
      b.words += wordCounts.get(entryId) ?? 0;
      byUser.set(author.user_id, b);
    }
  }

  // Attribute traffic + earnings to primary authors only
  const primaryAuthorByEntry = new Map<string, Set<string>>();
  for (const [entryId, arr] of authors.entries()) {
    const set = new Set(
      arr.filter((a) => a.role === "primary").map((a) => a.user_id),
    );
    primaryAuthorByEntry.set(entryId, set);
  }

  for (const r of ga4Rows) {
    const set = primaryAuthorByEntry.get(r.entry_id);
    if (!set) continue;
    for (const uid of set) {
      const b = byUser.get(uid);
      if (!b) continue;
      b.pageviews += r.pageviews;
    }
  }
  for (const r of raptiveRows) {
    if (!r.entry_id) continue;
    const set = primaryAuthorByEntry.get(r.entry_id);
    if (!set) continue;
    for (const uid of set) {
      const b = byUser.get(uid);
      if (!b) continue;
      b.earnings += Number(r.earnings) || 0;
    }
  }

  const out: AnalyticsWriterRow[] = Array.from(byUser.entries())
    .map(([user_id, b]) => ({
      user_id,
      display_name: b.display_name,
      avatar_url: b.avatar_url,
      articles: b.articleSet.size,
      pageviews: b.pageviews,
      earnings: b.earnings,
      revenue_per_word: b.words > 0 ? b.earnings / b.words : 0,
    }))
    .filter((r) => r.pageviews > 0 || r.earnings > 0);

  out.sort((a, b) => b.earnings - a.earnings);
  return out;
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
    "Avg Time on Page (s)",
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

// --------------------------------------------------------------------------
// Publish-to-peak curve
//
// Question this answers: "for the average article in this filter set, what
// does the pageview decay curve look like by day-since-publish?" Useful for
// spotting articles that under- or over-perform their natural lifecycle.
// --------------------------------------------------------------------------

export async function getPublishToPeakCurve(
  filters: AnalyticsFilters,
  maxDays = 30,
): Promise<PublishToPeakPoint[]> {
  const entries = await loadEntriesForRange(filters);
  let entryIds = Array.from(entries.keys());

  // Author filter — match the per-author rollup logic
  if (filters.authorId) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("entry_authors")
      .select("entry_id")
      .eq("user_id", filters.authorId);
    const authored = new Set(
      ((data ?? []) as Array<{ entry_id: string }>).map((r) => r.entry_id),
    );
    entryIds = entryIds.filter((id) => authored.has(id));
  }

  const allGa4Rows = await loadGa4Rows(filters);
  const entrySet = new Set(entryIds);
  const ga4Rows = allGa4Rows.filter((r) => entrySet.has(r.entry_id));

  // Bucket pageviews by (entry, day-since-publish)
  type Bucket = { pageviews: number; saw: Set<string> };
  const buckets = new Map<number, Bucket>(); // day → bucket

  for (const r of ga4Rows) {
    const entry = entries.get(r.entry_id);
    if (!entry?.publish_date) continue;
    const pubDate = new Date(entry.publish_date);
    const viewDate = new Date(`${r.date}T00:00:00Z`);
    const diffMs = viewDate.getTime() - pubDate.setUTCHours(0, 0, 0, 0);
    const day = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (day < 0 || day > maxDays) continue;
    const b = buckets.get(day) ?? { pageviews: 0, saw: new Set<string>() };
    b.pageviews += r.pageviews;
    b.saw.add(r.entry_id);
    buckets.set(day, b);
  }

  const out: PublishToPeakPoint[] = [];
  for (let day = 0; day <= maxDays; day += 1) {
    const b = buckets.get(day);
    if (!b) {
      out.push({ day, avgPageviews: 0, articleCount: 0 });
      continue;
    }
    const articleCount = b.saw.size;
    out.push({
      day,
      avgPageviews: articleCount > 0 ? b.pageviews / articleCount : 0,
      articleCount,
    });
  }
  return out;
}

// --------------------------------------------------------------------------
// Day-of-week heatmap
//
// We don't have hour-of-day data (GA4 sync pulls daily totals only), so the
// heatmap is week × day-of-week. Useful for spotting weekday vs weekend
// performance patterns at a glance.
// --------------------------------------------------------------------------

export async function getDayOfWeekHeatmap(
  filters: AnalyticsFilters,
): Promise<DayOfWeekHeatPoint[]> {
  const entries = await loadEntriesForRange(filters);
  let entryIds = Array.from(entries.keys());

  if (filters.authorId) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("entry_authors")
      .select("entry_id")
      .eq("user_id", filters.authorId);
    const authored = new Set(
      ((data ?? []) as Array<{ entry_id: string }>).map((r) => r.entry_id),
    );
    entryIds = entryIds.filter((id) => authored.has(id));
  }

  const allGa4Rows = await loadGa4Rows(filters);
  const entrySet = new Set(entryIds);
  const ga4Rows = allGa4Rows.filter((r) => entrySet.has(r.entry_id));

  // Aggregate by (weekStart, dayOfWeek)
  const buckets = new Map<string, number>(); // key = `${weekStart}|${dow}`
  for (const r of ga4Rows) {
    const d = new Date(`${r.date}T00:00:00Z`);
    const dow = d.getUTCDay();
    // Week starts on Sunday (UTC).
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - dow);
    const weekStartIso = weekStart.toISOString().slice(0, 10);
    const key = `${weekStartIso}|${dow}`;
    buckets.set(key, (buckets.get(key) ?? 0) + r.pageviews);
  }

  const out: DayOfWeekHeatPoint[] = [];
  for (const [key, pageviews] of buckets.entries()) {
    const [weekStart, dowStr] = key.split("|");
    out.push({
      weekStart,
      dayOfWeek: Number(dowStr),
      pageviews,
    });
  }
  // Sort by week, then day
  out.sort(
    (a, b) =>
      a.weekStart.localeCompare(b.weekStart) || a.dayOfWeek - b.dayOfWeek,
  );
  return out;
}
