import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const TARGET_ROWS_PER_CHUNK = 20_000;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const inputs = process.argv.slice(2, -1);
const outputDirectory = path.resolve(process.argv.at(-1) ?? "");

if (inputs.length === 0 || !outputDirectory) {
  throw new Error("Usage: node scripts/prepare-raptive-history.mjs INPUT.xlsx [...] OUTPUT_DIRECTORY");
}
if (path.parse(outputDirectory).root === outputDirectory) {
  throw new Error("Refusing to use a filesystem root as the output directory");
}
if (fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).length > 0) {
  throw new Error("Output directory must be empty");
}
fs.mkdirSync(outputDirectory, { recursive: true });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase environment is required to build the current-entry match set");
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    return new Date(Math.round((value - 25569) * 86_400_000)).toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function number(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function wpSite(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pl" || normalized.includes("pitcher list")) return "pl";
  if (normalized === "qb" || normalized.includes("qb list")) return "qb";
  return null;
}

function normalizeAnalyticsPath(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  let pathname;
  try {
    if (/^https?:\/\//i.test(value)) pathname = new URL(value).pathname;
    else if (value.startsWith("//")) pathname = new URL(`https:${value}`).pathname;
    else if (/^(?:www\.)?[^/?#]+\.[^/?#]+(?:[/?#]|$)/i.test(value)) pathname = new URL(`https://${value}`).pathname;
    else pathname = new URL(value.startsWith("/") ? value : `/${value}`, "https://analytics-path.invalid").pathname;
  } catch {
    pathname = value.split(/[?#]/, 1)[0] ?? "";
  }
  try { pathname = decodeURI(pathname); } catch {}
  return pathname.toLowerCase().replace(/^\/+|\/+$/g, "");
}

function sheetRows(workbook, nameFragment) {
  const sheetName = workbook.SheetNames.find((name) => name.includes(nameFragment));
  if (!sheetName) throw new Error(`Missing sheet: ${nameFragment}`);
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: null,
    raw: true,
    blankrows: false,
  });
}

function rowValue(row, ...names) {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => key.trim().toLowerCase() === name);
    if (found) return found[1];
  }
  return null;
}

function addTotals(map, key, row) {
  const current = map.get(key) ?? { earnings: 0, sessions: 0, pageviews: 0 };
  current.earnings += row.earnings;
  current.sessions += row.sessions;
  current.pageviews += row.pageviews;
  map.set(key, current);
}

const entryPaths = new Map([["pl", new Map()], ["qb", new Map()]]);
let entryOffset = 0;
while (true) {
  const { data, error } = await supabase
    .from("entries")
    .select("id,site,wp_post_url")
    .not("wp_post_url", "is", null)
    .range(entryOffset, entryOffset + 999);
  if (error) throw new Error(`Entry URL lookup failed: ${error.code ?? "unknown"}`);
  for (const entry of data ?? []) {
    const normalized = normalizeAnalyticsPath(entry.wp_post_url);
    if (!normalized) continue;
    const siteMap = entryPaths.get(entry.site);
    if (!siteMap) continue;
    const existing = siteMap.get(normalized);
    if (existing && existing !== entry.id) {
      throw new Error(`Ambiguous ${entry.site} entry path: ${normalized}`);
    }
    siteMap.set(normalized, entry.id);
  }
  if ((data ?? []).length < 1000) break;
  entryOffset += 1000;
}

const sourceFiles = [];
const canonicalRows = new Map();
const detailTotals = new Map();
const expectedTotals = new Map();
const seenDates = new Map();
let exactDuplicates = 0;
let normalizedVariants = 0;

for (const input of inputs.map((item) => path.resolve(item))) {
  const bytes = fs.readFileSync(input);
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const detail = sheetRows(workbook, "Top Earning URLs");
  const siteLevel = sheetRows(workbook, "Topline Overview - Site");
  const fileName = path.basename(input);
  let fileMin = null;
  let fileMax = null;

  for (const source of siteLevel) {
    const date = isoDate(rowValue(source, "date", "day"));
    const site = wpSite(rowValue(source, "site name", "site"));
    const earnings = number(rowValue(source, "earnings", "total earnings", "revenue"));
    const sessions = number(rowValue(source, "sessions"));
    const pageviews = number(rowValue(source, "pageviews", "page views", "views"));
    if (!date || !site || earnings === null || sessions === null || pageviews === null) {
      throw new Error(`Invalid Site Level row in ${fileName}`);
    }
    const owner = seenDates.get(date);
    if (owner && owner !== fileName) throw new Error(`Overlapping source date ${date}`);
    seenDates.set(date, fileName);
    expectedTotals.set(`${site}\0${date}`, { earnings, sessions, pageviews });
    fileMin = fileMin === null || date < fileMin ? date : fileMin;
    fileMax = fileMax === null || date > fileMax ? date : fileMax;
  }

  for (const [detailIndex, source] of detail.entries()) {
    const date = isoDate(rowValue(source, "date", "day"));
    const site = wpSite(rowValue(source, "site name", "site"));
    const sourceUrl = String(rowValue(source, "page path", "page url", "url", "path") ?? "").trim();
    const pageUrl = sourceUrl || "urn:raptive:unattributed";
    const earnings = number(rowValue(source, "earnings", "total earnings", "revenue"));
    const rpm = number(rowValue(source, "rpm", "session rpm"));
    const pageRpm = number(rowValue(source, "page rpm", "pageview rpm", "page views rpm"));
    const sessions = number(rowValue(source, "sessions"));
    const pageviews = number(rowValue(source, "pageviews", "page views", "views"));
    if (!date || !site || !pageUrl || [earnings, rpm, pageRpm, sessions, pageviews].some((item) => item === null)) {
      const missing = Object.entries({ date, site, pageUrl, earnings, rpm, pageRpm, sessions, pageviews })
        .filter(([, value]) => value === null || value === "")
        .map(([key]) => key);
      throw new Error(
        `Invalid Top Earning URLs row ${detailIndex + 2} in ${fileName}; ` +
        `site_label=${JSON.stringify(rowValue(source, "site name", "site"))}; missing=${missing.join(",")}`,
      );
    }
    const row = { wp_site: site, date, page_url: pageUrl, earnings, rpm, page_rpm: pageRpm, sessions, pageviews };
    addTotals(detailTotals, `${site}\0${date}`, row);
    const normalized = normalizeAnalyticsPath(pageUrl) || pageUrl.toLowerCase();
    const key = `${site}\0${date}\0${normalized}`;
    const existing = canonicalRows.get(key);
    if (!existing) {
      canonicalRows.set(key, row);
      continue;
    }
    const sameMetrics = ["earnings", "rpm", "page_rpm", "sessions", "pageviews"].every((field) => existing[field] === row[field]);
    if (existing.page_url === row.page_url) {
      if (!sameMetrics) throw new Error(`Conflicting exact duplicate in ${fileName}`);
      exactDuplicates += 1;
      continue;
    }
    normalizedVariants += 1;
    existing.earnings += row.earnings;
    existing.sessions += row.sessions;
    existing.pageviews += row.pageviews;
    existing.rpm = existing.sessions > 0 ? (existing.earnings / existing.sessions) * 1000 : 0;
    existing.page_rpm = existing.pageviews > 0 ? (existing.earnings / existing.pageviews) * 1000 : 0;
  }

  sourceFiles.push({
    fileName,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    dateRange: { start: fileMin, end: fileMax },
    detailRows: detail.length,
  });
}

const mismatchCounts = { earnings: 0, sessions: 0, pageviews: 0 };
const aggregateCoverage = {
  expected: { earnings: 0, sessions: 0, pageviews: 0 },
  detail: { earnings: 0, sessions: 0, pageviews: 0 },
};
const mismatches = [];
let adjustmentRows = 0;
for (const [key, expected] of expectedTotals) {
  const actual = detailTotals.get(key) ?? { earnings: 0, sessions: 0, pageviews: 0 };
  const fields = {
    earnings: Math.abs(actual.earnings - expected.earnings) > 0.001,
    sessions: actual.sessions !== expected.sessions,
    pageviews: actual.pageviews !== expected.pageviews,
  };
  for (const field of Object.keys(fields)) {
    aggregateCoverage.expected[field] += expected[field];
    aggregateCoverage.detail[field] += actual[field];
    if (fields[field]) mismatchCounts[field] += 1;
  }
  if (actual.sessions > expected.sessions || actual.pageviews > expected.pageviews) {
    mismatches.push(key.replace("\0", ":"));
    continue;
  }
  const [site, date] = key.split("\0");
  const adjustment = {
    wp_site: site,
    date,
    page_url: "urn:raptive:site-level-adjustment",
    earnings: expected.earnings - actual.earnings,
    sessions: expected.sessions - actual.sessions,
    pageviews: expected.pageviews - actual.pageviews,
  };
  adjustment.rpm = adjustment.sessions > 0
    ? (adjustment.earnings / adjustment.sessions) * 1000
    : 0;
  adjustment.page_rpm = adjustment.pageviews > 0
    ? (adjustment.earnings / adjustment.pageviews) * 1000
    : 0;
  if (
    Math.abs(adjustment.earnings) > 0.0000001 ||
    adjustment.sessions > 0 ||
    adjustment.pageviews > 0
  ) {
    canonicalRows.set(`${site}\0${date}\0urn:raptive:site-level-adjustment`, adjustment);
    adjustmentRows += 1;
  }
}
if (mismatches.length > 0) {
  console.log(JSON.stringify({
    ok: false,
    sourceOverageSiteDays: mismatches.length,
    mismatchCounts,
    coverageRatios: Object.fromEntries(
      Object.keys(aggregateCoverage.expected).map((field) => [
        field,
        aggregateCoverage.expected[field] === 0
          ? null
          : Number((aggregateCoverage.detail[field] / aggregateCoverage.expected[field]).toFixed(6)),
      ]),
    ),
    firstMismatches: mismatches.slice(0, 5),
  }));
  throw new Error(`Top Earning URLs exceeds Site Level traffic for ${mismatches.length} site-days; first=${mismatches.slice(0, 5).join(",")}`);
}

const attributableTotals = new Map();
const unmatchedTotals = new Map();
let attributableSourceRows = 0;
let unmatchedSourceRows = 0;
for (const row of canonicalRows.values()) {
  const normalized = normalizeAnalyticsPath(row.page_url);
  const entryId = normalized ? entryPaths.get(row.wp_site)?.get(normalized) : null;
  if (entryId) {
    attributableSourceRows += 1;
    const key = `${row.wp_site}\0${row.date}\0${entryId}`;
    const total = attributableTotals.get(key) ?? {
      wp_site: row.wp_site,
      date: row.date,
      entry_id: entryId,
      page_url: row.page_url,
      earnings: 0,
      sessions: 0,
      pageviews: 0,
    };
    total.earnings += row.earnings;
    total.sessions += row.sessions;
    total.pageviews += row.pageviews;
    attributableTotals.set(key, total);
    continue;
  }
  unmatchedSourceRows += 1;
  const key = `${row.wp_site}\0${row.date}`;
  const total = unmatchedTotals.get(key) ?? {
    wp_site: row.wp_site,
    date: row.date,
    entry_id: null,
    page_url: "urn:raptive:unmatched-total",
    earnings: 0,
    sessions: 0,
    pageviews: 0,
  };
  total.earnings += row.earnings;
  total.sessions += row.sessions;
  total.pageviews += row.pageviews;
  unmatchedTotals.set(key, total);
}
const attributableStoredEarnings = new Map();
for (const total of attributableTotals.values()) {
  total.earnings = Number(total.earnings.toFixed(4));
  const key = `${total.wp_site}\0${total.date}`;
  attributableStoredEarnings.set(
    key,
    Number(((attributableStoredEarnings.get(key) ?? 0) + total.earnings).toFixed(4)),
  );
  total.rpm = total.sessions > 0 ? (total.earnings / total.sessions) * 1000 : 0;
  total.page_rpm = total.pageviews > 0 ? (total.earnings / total.pageviews) * 1000 : 0;
}
for (const [key, expected] of expectedTotals) {
  const unmatched = unmatchedTotals.get(key);
  if (!unmatched) throw new Error(`Missing unmatched reconciliation row for ${key.replace("\0", ":")}`);
  unmatched.earnings = Number((
    Number(expected.earnings.toFixed(4)) - (attributableStoredEarnings.get(key) ?? 0)
  ).toFixed(4));
}
for (const total of unmatchedTotals.values()) {
  total.rpm = total.sessions > 0 ? (total.earnings / total.sessions) * 1000 : 0;
  total.page_rpm = total.pageviews > 0 ? (total.earnings / total.pageviews) * 1000 : 0;
}

const attributableRows = [...attributableTotals.values()];
const rows = [...attributableRows, ...unmatchedTotals.values()].sort((a, b) =>
  a.date.localeCompare(b.date) || a.wp_site.localeCompare(b.wp_site) || a.page_url.localeCompare(b.page_url),
);
const compactTotals = new Map();
for (const row of rows) addTotals(compactTotals, `${row.wp_site}\0${row.date}`, row);
for (const [key, expected] of expectedTotals) {
  const actual = compactTotals.get(key);
  if (
    !actual ||
    Math.abs(actual.earnings - expected.earnings) > 0.001 ||
    actual.sessions !== expected.sessions ||
    actual.pageviews !== expected.pageviews
  ) throw new Error(`Compacted totals failed reconciliation for ${key.replace("\0", ":")}`);
}
const dates = [...new Set(rows.map((row) => row.date))];
const rowsByDate = new Map();
for (const row of rows) {
  const day = rowsByDate.get(row.date) ?? [];
  day.push(row);
  rowsByDate.set(row.date, day);
}
for (let index = 1; index < dates.length; index += 1) {
  const expected = new Date(`${dates[index - 1]}T00:00:00.000Z`);
  expected.setUTCDate(expected.getUTCDate() + 1);
  if (expected.toISOString().slice(0, 10) !== dates[index]) {
    throw new Error(`Missing source date between ${dates[index - 1]} and ${dates[index]}`);
  }
}
const chunks = [];
let pending = [];
let part = 1;

function writeChunk(chunkRows) {
  const start = chunkRows[0].date;
  const end = chunkRows.at(-1).date;
  const values = [
    ["Date", "Site Name", "Page Path", "Earnings", "RPM", "Page RPM", "Sessions", "Pageviews"],
    ...chunkRows.map((row) => [
      row.date,
      row.wp_site === "pl" ? "Pitcher List" : "QB List",
      row.page_url,
      row.earnings,
      row.rpm,
      row.page_rpm,
      row.sessions,
      row.pageviews,
    ]),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(values), "Top Earning URLs");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
  if (buffer.length > MAX_CHUNK_BYTES) throw new Error(`Generated chunk exceeds hosting limit: ${start}-${end}`);
  const fileName = `raptive-history-${start.replaceAll("-", "")}-${end.replaceAll("-", "")}-part${String(part).padStart(2, "0")}.xlsx`;
  fs.writeFileSync(path.join(outputDirectory, fileName), buffer);
  const compactFileName = fileName.replace(/\.xlsx$/, ".json.gz");
  const compactBuffer = zlib.gzipSync(Buffer.from(JSON.stringify(chunkRows.map((row) => ({
    wp_site: row.wp_site,
    date: row.date,
    entry_id: row.entry_id,
    earnings: Number(row.earnings.toFixed(4)),
    sessions: row.sessions,
    pageviews: row.pageviews,
  })))), { level: 9 });
  fs.writeFileSync(path.join(outputDirectory, compactFileName), compactBuffer);
  chunks.push({
    fileName,
    bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    rows: chunkRows.length,
    compactFileName,
    compactBytes: compactBuffer.length,
    compactSha256: crypto.createHash("sha256").update(compactBuffer).digest("hex"),
    dateRange: { start, end },
    sites: Object.fromEntries(["pl", "qb"].map((site) => [site, chunkRows.filter((row) => row.wp_site === site).length])),
    expectedStoredEarnings: Number(chunkRows.reduce((sum, row) => sum + Number(row.earnings.toFixed(4)), 0).toFixed(4)),
  });
  part += 1;
}

for (const date of dates) {
  const dayRows = rowsByDate.get(date) ?? [];
  if (pending.length > 0 && pending.length + dayRows.length > TARGET_ROWS_PER_CHUNK) {
    writeChunk(pending);
    pending = [];
  }
  pending.push(...dayRows);
}
if (pending.length > 0) writeChunk(pending);

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceFiles,
  sourceDateRange: { start: dates[0], end: dates.at(-1) },
  sourceDates: dates.length,
  sourceCanonicalRows: canonicalRows.size,
  canonicalRows: rows.length,
  attributableSourceRows,
  attributableRows: attributableRows.length,
  unmatchedSourceRows,
  unmatchedAggregateRows: unmatchedTotals.size,
  exactDuplicates,
  normalizedVariants,
  adjustmentRows,
  trafficReconciledSiteDays: expectedTotals.size,
  historyTotals: Object.fromEntries(["pl", "qb"].map((site) => {
    const siteRows = rows.filter((row) => row.wp_site === site);
    return [site, {
      rows: siteRows.length,
      dateStart: siteRows[0]?.date ?? null,
      dateEnd: siteRows.at(-1)?.date ?? null,
      earnings: Number(siteRows.reduce((sum, row) => sum + row.earnings, 0).toFixed(4)),
      sessions: siteRows.reduce((sum, row) => sum + row.sessions, 0),
      pageviews: siteRows.reduce((sum, row) => sum + row.pageviews, 0),
    }];
  })),
  siteLevelComparison: {
    mismatchCounts,
    coverageRatios: Object.fromEntries(
      Object.keys(aggregateCoverage.expected).map((field) => [
        field,
        aggregateCoverage.expected[field] === 0
          ? null
          : Number((aggregateCoverage.detail[field] / aggregateCoverage.expected[field]).toFixed(6)),
      ]),
    ),
  },
  chunks,
};
fs.writeFileSync(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  sourceFiles: sourceFiles.length,
  dateRange: manifest.sourceDateRange,
  dates: dates.length,
  rows: rows.length,
  attributableSourceRows,
  attributableRows: attributableRows.length,
  unmatchedSourceRows,
  unmatchedAggregateRows: unmatchedTotals.size,
  exactDuplicates,
  normalizedVariants,
  adjustmentRows,
  trafficReconciledSiteDays: expectedTotals.size,
  chunks: chunks.length,
  largestChunkBytes: Math.max(...chunks.map((chunk) => chunk.bytes)),
}));
