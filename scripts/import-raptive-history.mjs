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
let imported = 0;

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
  for (let offset = 0; offset < rows.length; offset += 1000) {
    const batch = rows.slice(offset, offset + 1000);
    const { data, error } = await supabase.rpc("upsert_raptive_history_batch", { p_rows: batch });
    if (error) throw new Error(`History batch failed: ${error.code ?? "unknown"} ${error.message}`);
    if (data !== batch.length) throw new Error(`History batch count mismatch: expected ${batch.length}, received ${data}`);
    imported += batch.length;
  }
  console.log(JSON.stringify({ chunk: chunkIndex + 1, chunks: manifest.chunks.length, imported }));
}

const { data: summary, error: summaryError } = await supabase.rpc("get_raptive_history_summary");
if (summaryError) throw new Error(`History summary failed: ${summaryError.code ?? "unknown"}`);
for (const site of ["pl", "qb"]) {
  const actual = summary.find((row) => row.wp_site === site);
  const expected = manifest.historyTotals[site];
  if (!actual || Number(actual.rows) !== expected.rows ||
      Math.abs(Number(actual.earnings) - expected.earnings) > 0.001 ||
      Number(actual.sessions) !== expected.sessions ||
      Number(actual.pageviews) !== expected.pageviews ||
      actual.date_start !== expected.dateStart ||
      actual.date_end !== expected.dateEnd) {
    throw new Error(`History reconciliation failed for ${site}`);
  }
}
console.log(JSON.stringify({ ok: true, imported, summary }));
