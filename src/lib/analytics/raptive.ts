import "server-only";

import * as XLSX from "xlsx";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildAnalyticsPathIndex,
  normalizeAnalyticsPath,
} from "@/lib/analytics/url-normalization";
import { MAX_RAPTIVE_IMPORT_ROWS } from "@/lib/analytics/raptive-contract";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type RaptiveParsedRow = {
  wp_site: "pl" | "qb";
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
      dataSheetCount: number;
      duplicateCount: number;
      rejectedCount: number;
      sampleRejected: Array<{
        sheet: string;
        row: number;
        reason: string;
      }>;
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

export type RaptiveImportRunRow = {
  id: string;
  status: "running" | "succeeded" | "failed";
  file_name: string;
  started_at: string;
  finished_at: string | null;
  rows_processed: number | null;
  date_range_start: string | null;
  date_range_end: string | null;
  error_code: string | null;
  requester_name: string | null;
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
    wp_site: findBy("site name", "site"),
    date: findBy("date", "day"),
    page_url: findBy("page url", "url", "page path", "path", "permalink"),
    earnings: findBy("earnings", "total earnings", "revenue", "gross earnings"),
    rpm: findBy("rpm", "session rpm"),
    page_rpm: findBy("page rpm", "pageview rpm", "page views rpm"),
    sessions: findBy("sessions"),
    pageviews: findBy("pageviews", "page views", "views"),
  };
}

function coerceWpSite(value: unknown, pageUrl: string): "pl" | "qb" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pl" || normalized.includes("pitcher list")) return "pl";
  if (normalized === "qb" || normalized.includes("qb list")) return "qb";
  try {
    const hostname = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === "pitcherlist.com") return "pl";
    if (hostname === "football.pitcherlist.com") return "qb";
  } catch {
    // Relative paths require an explicit Site Name column.
  }
  return null;
}

function coerceNumber(v: unknown, allowBlank = true): number | null {
  if (v === null || v === undefined || v === "") {
    return allowBlank ? 0 : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // Strip $, commas, percent signs
    const cleaned = v.replace(/[$,%\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function validIsoDate(year: string, month: string, day: string): string | null {
  const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
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
    if (iso) return validIsoDate(iso[1], iso[2], iso[3]);
    // US format M/D/YYYY
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
    if (us) {
      return validIsoDate(us[3], us[1], us[2]);
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
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return {
      ok: false,
      error: "Failed to read workbook. Upload a valid XLSX file.",
    };
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return {
      ok: false,
      error: "Failed to read workbook. Upload a valid XLSX file.",
    };
  }

  if (workbook.SheetNames.length === 0) {
    return { ok: false, error: "Workbook has no sheets" };
  }

  const rows: RaptiveParsedRow[] = [];
  const rowsByKey = new Map<string, RaptiveParsedRow>();
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let dataSheetCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;
  const sampleRejected: Array<{
    sheet: string;
    row: number;
    reason: string;
  }> = [];
  const reject = (sheet: string, row: number, reason: string) => {
    rejectedCount += 1;
    if (sampleRejected.length < 10) sampleRejected.push({ sheet, row, reason });
  };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    });
    const headerIndex = matrix.findIndex((candidate) => {
      const sample = Object.fromEntries(
        candidate.map((value, index) => [
          String(value ?? `column_${index}`),
          null,
        ]),
      );
      const resolved = resolveColumns(sample);
      return Boolean(resolved?.date && resolved.page_url && resolved.earnings);
    });
    if (headerIndex < 0) continue;

    dataSheetCount += 1;
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: headerIndex,
      defval: null,
      raw: true,
      blankrows: false,
    });
    const cols = resolveColumns(raw[0] ?? {});
    if (!cols?.date || !cols.page_url || !cols.earnings) continue;

    for (const [rowIndex, record] of raw.entries()) {
      const excelRow = headerIndex + rowIndex + 2;
      const date = coerceDate(record[cols.date]);
      const sourceUrl = String(record[cols.page_url] ?? "").trim();
      const url = sourceUrl || "urn:raptive:unattributed";
      if (!date) {
        reject(sheetName, excelRow, "Missing or invalid Date");
        continue;
      }
      const wpSite = coerceWpSite(
        cols.wp_site ? record[cols.wp_site] : null,
        url,
      );
      if (!wpSite) {
        reject(sheetName, excelRow, "Missing or unsupported Site Name");
        continue;
      }

      const earnings = coerceNumber(record[cols.earnings], false);
      const rpm = coerceNumber(cols.rpm ? record[cols.rpm] : null);
      const pageRpm = coerceNumber(cols.page_rpm ? record[cols.page_rpm] : null);
      const sessions = coerceNumber(
        cols.sessions ? record[cols.sessions] : null,
      );
      const pageviews = coerceNumber(
        cols.pageviews ? record[cols.pageviews] : null,
      );
      if (
        earnings === null ||
        rpm === null ||
        pageRpm === null ||
        sessions === null ||
        pageviews === null
      ) {
        reject(sheetName, excelRow, "Invalid numeric value");
        continue;
      }
      if (
        !Number.isSafeInteger(sessions) ||
        sessions < 0 ||
        !Number.isSafeInteger(pageviews) ||
        pageviews < 0
      ) {
        reject(
          sheetName,
          excelRow,
          "Sessions and pageviews must be nonnegative integers",
        );
        continue;
      }

      const parsedRow: RaptiveParsedRow = {
        wp_site: wpSite,
        date,
        page_url: url,
        earnings,
        rpm,
        page_rpm: pageRpm,
        sessions,
        pageviews,
      };
      const normalizedUrl = normalizeAnalyticsPath(url) || url.toLowerCase();
      const key = `${wpSite}\u0000${date}\u0000${normalizedUrl}`;
      const existing = rowsByKey.get(key);
      if (existing) {
        if (
          existing.earnings !== parsedRow.earnings ||
          existing.rpm !== parsedRow.rpm ||
          existing.page_rpm !== parsedRow.page_rpm ||
          existing.sessions !== parsedRow.sessions ||
          existing.pageviews !== parsedRow.pageviews
        ) {
          return {
            ok: false,
            error: "Conflicting duplicate rows found for the same date and URL",
          };
        }
        duplicateCount += 1;
        continue;
      }

      rowsByKey.set(key, parsedRow);
      rows.push(parsedRow);
      if (rows.length > MAX_RAPTIVE_IMPORT_ROWS) {
        return {
          ok: false,
          error: "Workbook must contain between 1 and 100,000 valid rows",
        };
      }
      if (minDate === null || date < minDate) minDate = date;
      if (maxDate === null || date > maxDate) maxDate = date;
    }
  }

  if (dataSheetCount === 0) {
    return {
      ok: false,
      error: "No sheet contains Date, Page URL, and Earnings columns",
    };
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
    dataSheetCount,
    duplicateCount,
    rejectedCount,
    sampleRejected,
  };
}

// --------------------------------------------------------------------------
// Match parsed URLs to entries
// --------------------------------------------------------------------------

export async function matchRaptiveRowsToEntries(
  rows: RaptiveParsedRow[],
  site?: "pl" | "qb",
): Promise<{
  matched: Array<RaptiveParsedRow & { entry_id: string | null }>;
  matchedCount: number;
  unmatchedCount: number;
  sampleUnmatched: string[];
}> {
  const supabase = getSupabaseAdmin();
  const rowsBySite: Array<{
    id: string;
    wp_post_url: string | null;
    site: "pl" | "qb";
  }> = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("entries")
      .select("id, wp_post_url, site")
      .not("wp_post_url", "is", null)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (site) query = query.eq("site", site);
    const { data, error } = await query;
    if (error) {
      throw Object.assign(new Error("Raptive entry matching is unavailable"), {
        code: "entry_match_unavailable",
      });
    }
    rowsBySite.push(...((data ?? []) as typeof rowsBySite));
    if ((data ?? []).length < pageSize) break;
  }
  const entryUrlMaps = new Map(
    (["pl", "qb"] as const).map((wpSite) => [
      wpSite,
      buildAnalyticsPathIndex(
        rowsBySite
          .filter((row) => row.site === wpSite)
          .map((row) => ({ id: row.id, url: row.wp_post_url })),
      ),
    ]),
  );

  const matched: Array<RaptiveParsedRow & { entry_id: string | null }> = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  const sampleUnmatched: string[] = [];

  for (const r of rows) {
    const norm = normalizeAnalyticsPath(r.page_url);
    const entryId = entryUrlMaps.get(r.wp_site)?.get(norm) ?? null;
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
  importRunId: string,
  rows: Array<RaptiveParsedRow & { entry_id: string | null }>,
  dateRange: { start: string; end: string },
  fileName: string,
  uploadedBy: string,
  summary: {
    matchedCount: number;
    unmatchedCount: number;
    dataSheetCount: number;
    duplicateCount: number;
  },
): Promise<{ ok: true; inserted: number } | { ok: false; error: string }> {
  if (rows.length === 0) {
    return { ok: false, error: "No rows to commit" };
  }
  const supabase = getSupabaseAdmin();

  const payload = rows.map((r) => ({
    wp_site: r.wp_site,
    entry_id: r.entry_id,
    date: r.date,
    page_url: r.page_url,
    earnings: r.earnings,
    rpm: r.rpm,
    page_rpm: r.page_rpm,
    sessions: r.sessions,
    pageviews: r.pageviews,
  }));
  const { data: inserted, error } = await supabase.rpc(
    "commit_raptive_import",
    {
      p_import_run_id: importRunId,
      p_rows: payload,
      p_date_range_start: dateRange.start,
      p_date_range_end: dateRange.end,
      p_file_name: fileName,
      p_uploaded_by: uploadedBy,
      p_summary: {
        matched_count: summary.matchedCount,
        unmatched_count: summary.unmatchedCount,
        data_sheet_count: summary.dataSheetCount,
        duplicate_count: summary.duplicateCount,
      },
    },
  );
  if (error || inserted === null) {
    try {
      const { data: recovered } = await supabase
        .from("import_runs")
        .select("status,rows_processed")
        .eq("id", importRunId)
        .maybeSingle();
      if (
        recovered?.status === "succeeded" &&
        typeof recovered.rows_processed === "number"
      ) {
        return { ok: true, inserted: recovered.rows_processed };
      }
    } catch {
      // The caller will preserve the safe failure and durable running record.
    }
    return { ok: false, error: "Failed to commit Raptive import" };
  }

  return { ok: true, inserted };
}

export async function beginRaptiveImportRun(
  fileName: string,
  requestedBy: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("begin_import_run", {
    p_import_type: "raptive",
    p_file_name: fileName,
    p_requested_by: requestedBy,
  });
  return error ? null : data;
}

export async function failRaptiveImportRun(
  importRunId: string,
  errorCode: string,
  stage: "matching" | "commit",
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("finish_import_run", {
    p_import_run_id: importRunId,
    p_succeeded: false,
    p_error_code: errorCode,
    p_summary: { stage },
  });
  return !error && data === true;
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

export async function listRaptiveImportRuns(): Promise<RaptiveImportRunRow[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("import_runs")
    .select(
      "id,status,file_name,started_at,finished_at,rows_processed,date_range_start,date_range_end,error_code,requested_by,users(display_name)",
    )
    .eq("import_type", "raptive")
    .order("started_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    status: "running" | "succeeded" | "failed";
    file_name: string;
    started_at: string;
    finished_at: string | null;
    rows_processed: number | null;
    date_range_start: string | null;
    date_range_end: string | null;
    error_code: string | null;
    users: { display_name: string } | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    file_name: row.file_name,
    started_at: row.started_at,
    finished_at: row.finished_at,
    rows_processed: row.rows_processed,
    date_range_start: row.date_range_start,
    date_range_end: row.date_range_end,
    error_code: row.error_code,
    requester_name: row.users?.display_name ?? null,
  }));
}
