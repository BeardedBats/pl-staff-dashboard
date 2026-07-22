import "server-only";

import * as XLSX from "xlsx";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildAnalyticsPathIndex,
  normalizeAnalyticsPath,
} from "@/lib/analytics/url-normalization";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type RaptiveParsedRow = {
  /** YYYY-MM-DD */
  date: string;
  page_url: string;
  earnings: number;
  rpm: number;
  page_rpm: number;
  sessions: number;
  pageviews: number;
};

export type RaptiveParseResult =
  | {
      ok: true;
      rows: RaptiveParsedRow[];
      dateRange: { start: string; end: string };
      matchedCount: number;
      unmatchedCount: number;
      sampleUnmatched: string[];
    }
  | {
      ok: false;
      error: string;
    };

export type RaptiveUploadHistoryRow = {
  id: string;
  file_name: string;
  date_range_start: string;
  date_range_end: string;
  rows_imported: number;
  created_at: string;
  uploaded_by: string;
  uploader_name: string;
};

// --------------------------------------------------------------------------
// Column resolution
// --------------------------------------------------------------------------

/**
 * Raptive exports vary by account — column headers differ between "Page URL"
 * and "URL", "Earnings" and "Total Earnings", etc. This resolver takes the
 * first row of a parsed sheet and maps our canonical fields to the actual
 * column key, using loose substring matching.
 */
function resolveColumns(
  sample: Record<string, unknown>,
): Record<keyof RaptiveParsedRow, string | null> | null {
  const keys = Object.keys(sample);
  const findBy = (...needles: string[]): string | null => {
    for (const k of keys) {
      const norm = k.trim().toLowerCase().replace(/\s+/g, " ");
      for (const n of needles) {
        if (norm === n) return k;
      }
    }
    // Second pass — substring match
    for (const k of keys) {
      const norm = k.trim().toLowerCase();
      for (const n of needles) {
        if (norm.includes(n)) return k;
      }
    }
    return null;
  };

  return {
    date: findBy("date", "day"),
    page_url: findBy("page url", "url", "page path", "path", "permalink"),
    earnings: findBy("earnings", "total earnings", "revenue", "gross earnings"),
    rpm: findBy("rpm", "session rpm"),
    page_rpm: findBy("page rpm", "pageview rpm", "page views rpm"),
    sessions: findBy("sessions"),
    pageviews: findBy("pageviews", "page views", "views"),
  };
}

function coerceNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // Strip $, commas, percent signs
    const cleaned = v.replace(/[$,%\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function coerceDate(v: unknown): string | null {
  // Excel date serial number → real date
  if (typeof v === "number") {
    // Excel epoch: days since 1899-12-30
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    // ISO-ish format already?
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    // US format M/D/YYYY
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
    if (us) {
      const mm = us[1].padStart(2, "0");
      const dd = us[2].padStart(2, "0");
      return `${us[3]}-${mm}-${dd}`;
    }
    // Fallback — let Date() try
    const d = new Date(trimmed);
    if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

// --------------------------------------------------------------------------
// Parse the XLSX buffer
// --------------------------------------------------------------------------

export function parseRaptiveWorkbook(buffer: Buffer): RaptiveParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return {
      ok: false,
      error: "Failed to read workbook. Upload a valid XLSX file.",
    };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { ok: false, error: "Workbook has no sheets" };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  }) as Array<Record<string, unknown>>;

  if (raw.length === 0) {
    return { ok: false, error: "Workbook is empty" };
  }

  const cols = resolveColumns(raw[0]);
  if (!cols) {
    return { ok: false, error: "Could not resolve columns" };
  }
  if (!cols.date || !cols.page_url || !cols.earnings) {
    return {
      ok: false,
      error: `Missing required columns. Need Date, Page URL, and Earnings. Found keys: ${Object.keys(
        raw[0],
      ).join(", ")}`,
    };
  }

  const rows: RaptiveParsedRow[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const r of raw) {
    const date = coerceDate(cols.date ? r[cols.date] : null);
    const url = cols.page_url ? String(r[cols.page_url] ?? "").trim() : "";
    if (!date || !url) continue;

    const earnings = coerceNumber(cols.earnings ? r[cols.earnings] : 0);
    const rpm = coerceNumber(cols.rpm ? r[cols.rpm] : 0);
    const pageRpm = coerceNumber(cols.page_rpm ? r[cols.page_rpm] : 0);
    const sessions = Math.round(
      coerceNumber(cols.sessions ? r[cols.sessions] : 0),
    );
    const pageviews = Math.round(
      coerceNumber(cols.pageviews ? r[cols.pageviews] : 0),
    );

    rows.push({
      date,
      page_url: url,
      earnings,
      rpm,
      page_rpm: pageRpm,
      sessions,
      pageviews,
    });

    if (minDate === null || date < minDate) minDate = date;
    if (maxDate === null || date > maxDate) maxDate = date;
  }

  if (rows.length === 0) {
    return { ok: false, error: "No valid rows found in workbook" };
  }

  return {
    ok: true,
    rows,
    dateRange: {
      start: minDate ?? rows[0].date,
      end: maxDate ?? rows[0].date,
    },
    matchedCount: 0, // Filled in by matchToEntries
    unmatchedCount: 0,
    sampleUnmatched: [],
  };
}

// --------------------------------------------------------------------------
// Match parsed URLs to entries
// --------------------------------------------------------------------------

export async function matchRaptiveRowsToEntries(
  rows: RaptiveParsedRow[],
): Promise<{
  matched: Array<RaptiveParsedRow & { entry_id: string | null }>;
  matchedCount: number;
  unmatchedCount: number;
  sampleUnmatched: string[];
}> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("entries")
    .select("id, wp_post_url")
    .not("wp_post_url", "is", null);

  const entryUrlMap = buildAnalyticsPathIndex(
    ((data ?? []) as Array<{
      id: string;
      wp_post_url: string | null;
    }>).map((row) => ({ id: row.id, url: row.wp_post_url })),
  );

  const matched: Array<RaptiveParsedRow & { entry_id: string | null }> = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  const sampleUnmatched: string[] = [];

  for (const r of rows) {
    const norm = normalizeAnalyticsPath(r.page_url);
    const entryId = entryUrlMap.get(norm) ?? null;
    if (entryId) {
      matchedCount += 1;
    } else {
      unmatchedCount += 1;
      if (sampleUnmatched.length < 10) sampleUnmatched.push(r.page_url);
    }
    matched.push({ ...r, entry_id: entryId });
  }

  return { matched, matchedCount, unmatchedCount, sampleUnmatched };
}

// --------------------------------------------------------------------------
// Commit — upsert rows + record upload history
// --------------------------------------------------------------------------

export async function commitRaptiveRows(
  rows: Array<RaptiveParsedRow & { entry_id: string | null }>,
  dateRange: { start: string; end: string },
  fileName: string,
  uploadedBy: string,
): Promise<{ ok: true; inserted: number } | { ok: false; error: string }> {
  if (rows.length === 0) {
    return { ok: false, error: "No rows to commit" };
  }
  const supabase = getSupabaseAdmin();

  // Clear existing rows in the date range to avoid duplicates. This matches
  // Raptive's update model — re-uploading the same period replaces it.
  const { error: delError } = await supabase
    .from("raptive_revenue")
    .delete()
    .gte("date", dateRange.start)
    .lte("date", dateRange.end);

  if (delError) {
    return { ok: false, error: "Failed to replace existing Raptive rows" };
  }

  // Chunk the inserts — Supabase REST caps payloads around 1 MB.
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({
      entry_id: r.entry_id,
      date: r.date,
      page_url: r.page_url,
      earnings: r.earnings,
      rpm: r.rpm,
      page_rpm: r.page_rpm,
      sessions: r.sessions,
      pageviews: r.pageviews,
    }));
    const { error } = await supabase.from("raptive_revenue").insert(chunk);
    if (error) {
      return {
        ok: false,
        error: `Failed to save Raptive rows (batch ${Math.floor(i / CHUNK) + 1})`,
      };
    }
    inserted += chunk.length;
  }

  // Record the upload history entry
  await supabase.from("raptive_uploads").insert({
    uploaded_by: uploadedBy,
    file_name: fileName,
    date_range_start: dateRange.start,
    date_range_end: dateRange.end,
    rows_imported: inserted,
  });

  return { ok: true, inserted };
}

// --------------------------------------------------------------------------
// Upload history
// --------------------------------------------------------------------------

export async function listRaptiveUploads(): Promise<RaptiveUploadHistoryRow[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("raptive_uploads")
    .select(
      "id, file_name, date_range_start, date_range_end, rows_imported, created_at, uploaded_by, users!inner(display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    file_name: string;
    date_range_start: string;
    date_range_end: string;
    rows_imported: number;
    created_at: string;
    uploaded_by: string;
    users: { display_name: string };
  }>;

  return rows.map((r) => ({
    id: r.id,
    file_name: r.file_name,
    date_range_start: r.date_range_start,
    date_range_end: r.date_range_end,
    rows_imported: r.rows_imported,
    created_at: r.created_at,
    uploaded_by: r.uploaded_by,
    uploader_name: r.users.display_name,
  }));
}
