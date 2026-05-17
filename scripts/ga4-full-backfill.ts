// --------------------------------------------------------------------------
// GA4 full historical backfill — day-by-day, resumable, local only.
//
//   npx tsx scripts/ga4-full-backfill.ts
//
// Why this exists: the in-app /api/admin/ga4-backfill route chunks GA4 calls
// monthly. GA4's runReport caps results at 100k rows ordered by pageviews
// desc, so even monthly chunks miss the long tail of low-traffic articles.
// A single-day call returns every page that had any traffic that day with
// effectively no cap, which gives complete per-article daily data.
//
// Mirrors src/lib/analytics/ga4.ts for credential storage:
//   global_settings keys: ga4_refresh_token, ga4_access_token,
//   ga4_access_expires (unix ms as string), ga4_property_id.
//   Token refresh POSTs to https://oauth2.googleapis.com/token using
//   GA4_CLIENT_ID + GA4_CLIENT_SECRET from .env.local.
// --------------------------------------------------------------------------

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

const START_DATE = "2022-10-01";
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const DAILY_DELAY_MS = 200;
const RESUME_TIMEOUT_MS = 10_000;

type Env = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  ga4ClientId: string;
  ga4ClientSecret: string;
  ga4PropertyIdEnv: string | undefined;
};

type Ga4Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type Ga4Row = {
  pagePath: string;
  date: string;
  pageviews: number;
  sessions: number;
  avgTimeOnPage: number;
};

// --------------------------------------------------------------------------
// .env.local loader — no dotenv dependency
// --------------------------------------------------------------------------

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      ".env.local not found in project root — run from the dashboard root",
    );
  }
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadEnv(): Env {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GA4_CLIENT_ID",
    "GA4_CLIENT_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing env vars in .env.local: ${missing.join(", ")}`);
  }
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ga4ClientId: process.env.GA4_CLIENT_ID!,
    ga4ClientSecret: process.env.GA4_CLIENT_SECRET!,
    ga4PropertyIdEnv: process.env.GA4_PROPERTY_ID,
  };
}

// --------------------------------------------------------------------------
// global_settings helpers (mirrors ga4.ts read/writeSetting)
// --------------------------------------------------------------------------

async function readSetting(
  supabase: SupabaseClient,
  key: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("global_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read ${key}: ${error.message}`);
  }
  if (!data) return null;
  const value = (data as { value: unknown }).value;
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

async function writeSetting(
  supabase: SupabaseClient,
  key: string,
  value: string,
): Promise<void> {
  const { error } = await supabase
    .from("global_settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) {
    throw new Error(`Failed to write ${key}: ${error.message}`);
  }
}

// --------------------------------------------------------------------------
// GA4 token handling — mirrors getFreshAccessToken in ga4.ts
// --------------------------------------------------------------------------

async function loadTokens(supabase: SupabaseClient): Promise<Ga4Tokens> {
  const refreshToken = await readSetting(supabase, "ga4_refresh_token");
  if (!refreshToken) {
    throw new Error(
      "ga4_refresh_token missing from global_settings — connect GA4 via Settings → Analytics first",
    );
  }
  const accessToken = await readSetting(supabase, "ga4_access_token");
  const expiresRaw = await readSetting(supabase, "ga4_access_expires");
  return {
    refreshToken,
    accessToken: accessToken ?? "",
    expiresAt: expiresRaw ? Number(expiresRaw) : 0,
  };
}

async function refreshAccessToken(
  supabase: SupabaseClient,
  env: Env,
  tokens: Ga4Tokens,
): Promise<Ga4Tokens> {
  const params = new URLSearchParams({
    client_id: env.ga4ClientId,
    client_secret: env.ga4ClientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Token refresh returned no access_token");
  }
  const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  await writeSetting(supabase, "ga4_access_token", data.access_token);
  await writeSetting(supabase, "ga4_access_expires", String(expiresAt));
  return {
    refreshToken: tokens.refreshToken,
    accessToken: data.access_token,
    expiresAt,
  };
}

async function ensureFreshToken(
  supabase: SupabaseClient,
  env: Env,
  tokens: Ga4Tokens,
): Promise<Ga4Tokens> {
  if (
    tokens.accessToken &&
    tokens.expiresAt > Date.now() + TOKEN_EXPIRY_MARGIN_MS
  ) {
    return tokens;
  }
  return refreshAccessToken(supabase, env, tokens);
}

// --------------------------------------------------------------------------
// GA4 runReport — single-day call, no dimensionFilter
// --------------------------------------------------------------------------

async function runGa4Report(
  propertyId: string,
  accessToken: string,
  day: string,
): Promise<Ga4Row[]> {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate: day, endDate: day }],
    dimensions: [{ name: "pagePath" }, { name: "date" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "sessions" },
      { name: "averageSessionDuration" },
    ],
    limit: 100000,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 error: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    rows?: Array<{
      dimensionValues: Array<{ value: string }>;
      metricValues: Array<{ value: string }>;
    }>;
  };
  const out: Ga4Row[] = [];
  for (const row of data.rows ?? []) {
    const pagePath = row.dimensionValues[0]?.value ?? "";
    const dateRaw = row.dimensionValues[1]?.value ?? "";
    if (!pagePath || dateRaw.length !== 8) continue;
    out.push({
      pagePath,
      date: `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`,
      pageviews: Number(row.metricValues[0]?.value ?? 0),
      sessions: Number(row.metricValues[1]?.value ?? 0),
      avgTimeOnPage: Number(row.metricValues[2]?.value ?? 0),
    });
  }
  return out;
}

// --------------------------------------------------------------------------
// Path normalisation — lowercase, strip trailing slash. Both the map keys
// (from wp_post_url.pathname) and the GA4 pagePath are reduced to "/slug".
// --------------------------------------------------------------------------

function normalisePath(raw: string): string {
  let s = raw.toLowerCase();
  while (s.endsWith("/") && s.length > 1) s = s.slice(0, -1);
  return s;
}

function pathnameFor(wpUrl: string): string | null {
  try {
    return new URL(wpUrl).pathname;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Date helpers — plain Date arithmetic, no date-fns
// --------------------------------------------------------------------------

function generateDailyWindows(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function yesterdayIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function addOneDayIso(iso: string): string {
  const [y, m, dy] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, dy) + 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

// --------------------------------------------------------------------------
// Resume prompt — 10s default to "r"
// --------------------------------------------------------------------------

async function promptResume(maxDate: string): Promise<"r" | "o" | "q"> {
  console.log(`\nFound existing data up to ${maxDate}.`);
  console.log("[r] Resume from next day");
  console.log(
    "[o] Overwrite — truncate article_analytics and start from 2022-10-01",
  );
  console.log("[q] Quit");

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const timer = setTimeout(() => {
      console.log("\n→ Defaulted to 'r' after 10s");
      rl.close();
      resolve("r");
    }, RESUME_TIMEOUT_MS);
    rl.question("\nYour choice (r/o/q, default r in 10s): ", (answer) => {
      clearTimeout(timer);
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "o") resolve("o");
      else if (a === "q") resolve("q");
      else resolve("r");
    });
  });
}

// --------------------------------------------------------------------------
// Utility
// --------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnvLocal();
  const env = loadEnv();

  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("GA4 Full Historical Backfill");
  console.log("─────────────────────────────────────────");

  // ---- Build entry URL map (pl site only) ----
  const entryRows: Array<{ id: string; wp_post_url: string | null }> = [];
  let entryFrom = 0;
  const entryBatchSize = 1000;
  while (true) {
    const { data, error: entryErr } = await supabase
      .from("entries")
      .select("id, wp_post_url")
      .eq("site", "pl")
      .not("wp_post_url", "is", null)
      .range(entryFrom, entryFrom + entryBatchSize - 1);
    if (entryErr) {
      throw new Error(`Failed to load entries: ${entryErr.message}`);
    }
    if (!data || data.length === 0) break;
    entryRows.push(
      ...(data as Array<{ id: string; wp_post_url: string | null }>),
    );
    if (data.length < entryBatchSize) break;
    entryFrom += entryBatchSize;
  }

  const urlMap = new Map<string, string>();
  for (const row of (entryRows ?? []) as Array<{
    id: string;
    wp_post_url: string | null;
  }>) {
    if (!row.wp_post_url) continue;
    const pathname = pathnameFor(row.wp_post_url);
    if (!pathname) continue;
    const key = normalisePath(pathname);
    if (!key || key === "/") continue;
    urlMap.set(key, row.id);
  }
  console.log(`Loaded ${urlMap.size} article URLs`);

  // ---- Load GA4 credentials + property ----
  const propertyId =
    (await readSetting(supabase, "ga4_property_id")) ?? env.ga4PropertyIdEnv;
  if (!propertyId) {
    throw new Error(
      "ga4_property_id missing — set it in global_settings or as GA4_PROPERTY_ID env",
    );
  }
  let tokens = await loadTokens(supabase);
  tokens = await ensureFreshToken(supabase, env, tokens);
  console.log(`GA4 property: ${propertyId}`);

  // ---- Resume vs overwrite ----
  let startDate = START_DATE;
  const endDate = yesterdayIso();

  const { data: maxRow, error: maxErr } = await supabase
    .from("article_analytics")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) {
    throw new Error(`Failed to query MAX(date): ${maxErr.message}`);
  }
  const existingMax = maxRow ? (maxRow as { date: string }).date : null;

  if (existingMax) {
    const choice = await promptResume(existingMax);
    if (choice === "q") {
      console.log("Quitting.");
      return;
    }
    if (choice === "o") {
      console.log("Truncating article_analytics…");
      // supabase-js refuses an unfiltered delete; a date predicate matches
      // every row without needing a raw SQL execution path.
      const { error: delErr } = await supabase
        .from("article_analytics")
        .delete()
        .gte("date", "1900-01-01");
      if (delErr) {
        throw new Error(`Truncate failed: ${delErr.message}`);
      }
      startDate = START_DATE;
    } else {
      startDate = addOneDayIso(existingMax);
    }
  }

  if (startDate > endDate) {
    console.log(`No days to process — start (${startDate}) > end (${endDate}).`);
    return;
  }

  const days = generateDailyWindows(startDate, endDate);
  const estMinutes = Math.max(1, Math.round((days.length * 2) / 60));
  console.log(`Date range: ${startDate} → ${endDate} (${days.length} days)`);
  console.log(`Estimated time: ~${estMinutes} minutes`);
  console.log("");
  console.log("Starting...");
  console.log("");

  // ---- Main day-by-day loop ----
  const startMs = Date.now();
  let totalRowsUpserted = 0;
  let totalErrors = 0;

  for (const day of days) {
    try {
      tokens = await ensureFreshToken(supabase, env, tokens);
    } catch (err) {
      console.error(
        `[${day}] Token refresh error: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }

    let rows: Ga4Row[];
    try {
      rows = await runGa4Report(propertyId, tokens.accessToken, day);
    } catch (err) {
      console.error(`[${day}] ${err instanceof Error ? err.message : err}`);
      totalErrors++;
      await sleep(DAILY_DELAY_MS);
      continue;
    }

    // Aggregate per (entry_id, date). GA4 can return /slug and /slug/ as
    // separate rows; without aggregating, the upsert's onConflict would
    // refuse the batch ("cannot affect row a second time").
    const agg = new Map<
      string,
      {
        entry_id: string;
        date: string;
        pageviews: number;
        sessions: number;
        avg_time_on_page: number;
        synced_at: string;
      }
    >();
    for (const r of rows) {
      const entryId = urlMap.get(normalisePath(r.pagePath));
      if (!entryId) continue;
      const key = `${entryId}|${r.date}`;
      const cur = agg.get(key);
      if (cur) {
        const totalViews = cur.pageviews + r.pageviews;
        cur.avg_time_on_page =
          totalViews > 0
            ? (cur.avg_time_on_page * cur.pageviews +
                r.avgTimeOnPage * r.pageviews) /
              totalViews
            : 0;
        cur.pageviews = totalViews;
        cur.sessions += r.sessions;
      } else {
        agg.set(key, {
          entry_id: entryId,
          date: r.date,
          pageviews: r.pageviews,
          sessions: r.sessions,
          avg_time_on_page: r.avgTimeOnPage,
          synced_at: new Date().toISOString(),
        });
      }
    }
    const upsertRows = Array.from(agg.values());

    if (upsertRows.length === 0) {
      console.log(`[${day}] ${rows.length} GA4 rows → 0 matched → skipped`);
      await sleep(DAILY_DELAY_MS);
      continue;
    }

    const { error: upsertErr } = await supabase
      .from("article_analytics")
      .upsert(upsertRows, { onConflict: "entry_id,date" });
    if (upsertErr) {
      console.error(`[${day}] Upsert error: ${upsertErr.message}`);
      totalErrors++;
      await sleep(DAILY_DELAY_MS);
      continue;
    }

    totalRowsUpserted += upsertRows.length;
    console.log(
      `[${day}] ${rows.length} GA4 rows → ${upsertRows.length} matched → upserted ✓`,
    );

    await sleep(DAILY_DELAY_MS);
  }

  const durationMs = Date.now() - startMs;
  console.log("");
  console.log("─────────────────────────────────────────");
  console.log("Done.");
  console.log(`Days processed: ${days.length}`);
  console.log(`Total rows upserted: ${totalRowsUpserted.toLocaleString()}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Duration: ${formatDuration(durationMs)}`);
}

main().catch((err) => {
  console.error("\nFatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
