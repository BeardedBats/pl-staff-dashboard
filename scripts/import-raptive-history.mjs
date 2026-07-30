import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const manifestPath = path.resolve(process.argv[2] ?? "");
if (!manifestPath || !fs.existsSync(manifestPath)) {
  throw new Error("Usage: node scripts/import-raptive-history.mjs MANIFEST.json");
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase environment is required");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const directory = path.dirname(manifestPath);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: importRunId, error: beginError } = await supabase.rpc(
  "begin_import_run",
  {
    p_import_type: "raptive",
    p_file_name: path.basename(manifestPath),
    p_requested_by: null,
  },
);
if (beginError || !importRunId) {
  throw new Error(`Could not record history import: ${beginError?.code ?? "unknown"}`);
}

try {
let imported = 0;
const expectedStored = new Map();

for (const [chunkIndex, chunk] of manifest.chunks.entries()) {
  const filePath = path.join(directory, chunk.compactFileName);
  const compressed = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(compressed).digest("hex");
  if (compressed.length !== chunk.compactBytes || hash !== chunk.compactSha256) {
    throw new Error(`Compact chunk integrity failure: ${chunk.compactFileName}`);
  }
  const rows = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
  if (!Array.isArray(rows) || rows.length !== chunk.rows) {
    throw new Error(`Compact chunk row mismatch: ${chunk.compactFileName}`);
  }
  for (const row of rows) {
    const total = expectedStored.get(row.wp_site) ?? {
      rows: 0, dateStart: row.date, dateEnd: row.date,
      earnings: 0, sessions: 0, pageviews: 0,
    };
    total.rows += 1;
    total.dateStart = row.date < total.dateStart ? row.date : total.dateStart;
    total.dateEnd = row.date > total.dateEnd ? row.date : total.dateEnd;
    total.earnings = Number((total.earnings + row.earnings).toFixed(4));
    total.sessions += row.sessions;
    total.pageviews += row.pageviews;
    expectedStored.set(row.wp_site, total);
  }
  for (let offset = 0; offset < rows.length; offset += 1000) {
    const batch = rows.slice(offset, offset + 1000);
    const { data, error } = await supabase.rpc("upsert_raptive_history_batch", { p_rows: batch });
    if (error) throw new Error(`History batch failed: ${error.code ?? "unknown"} ${error.message}`);
    if (data !== batch.length) throw new Error(`History batch count mismatch: expected ${batch.length}, received ${data}`);
    imported += batch.length;
  }
  console.log(JSON.stringify({ chunk: chunkIndex + 1, chunks: manifest.chunks.length, imported }));
}

const summary = [];
for (const site of ["pl", "qb"]) {
  const expected = expectedStored.get(site);
  const actual = {
    wp_site: site, rows: 0, date_start: null, date_end: null,
    earnings: 0, sessions: 0, pageviews: 0,
  };
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("raptive_history_daily")
      .select("date,entry_id,earnings,sessions,pageviews")
      .eq("wp_site", site)
      .gte("date", expected.dateStart)
      .lte("date", expected.dateEnd)
      .order("date").order("entry_id")
      .range(offset, offset + 999);
    if (error) throw new Error(`History summary failed: ${error.code ?? "unknown"}`);
    for (const row of data ?? []) {
      actual.rows += 1;
      actual.date_start ??= row.date;
      actual.date_end = row.date;
      actual.earnings = Number((actual.earnings + Number(row.earnings)).toFixed(4));
      actual.sessions += row.sessions;
      actual.pageviews += row.pageviews;
    }
    if ((data ?? []).length < 1000) break;
  }
  summary.push(actual);
  if (!actual || Number(actual.rows) !== expected.rows ||
      Math.abs(Number(actual.earnings) - expected.earnings) > 0.001 ||
      Number(actual.sessions) !== expected.sessions ||
      Number(actual.pageviews) !== expected.pageviews ||
      actual.date_start !== expected.dateStart ||
      actual.date_end !== expected.dateEnd) {
    throw new Error(`History reconciliation failed for ${site}`);
  }
}
const { data: finished, error: finishError } = await supabase.rpc(
  "finish_import_run",
  {
    p_import_run_id: importRunId,
    p_succeeded: true,
    p_rows_processed: imported,
    p_summary: { mode: "compact-history", summary },
  },
);
if (finishError || !finished) {
  throw new Error(`Could not complete history import record: ${finishError?.code ?? "unknown"}`);
}
console.log(JSON.stringify({ ok: true, importRunId, imported, summary }));
} catch (error) {
  await supabase.rpc("finish_import_run", {
    p_import_run_id: importRunId,
    p_succeeded: false,
    p_rows_processed: null,
    p_error_code: "history_import_failed",
    p_summary: { mode: "compact-history" },
  });
  throw error;
}
