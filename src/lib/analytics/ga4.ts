import "server-only";

import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normaliseUrl } from "@/lib/analytics/raptive";

// --------------------------------------------------------------------------
// GA4 integration
// --------------------------------------------------------------------------
//
// We talk directly to Google's OAuth + GA4 Data API with `fetch` rather than
// pulling in `googleapis` — keeps the bundle small and matches how other
// PitcherList tools (Game Card Automation, SP Streamers) hit Google services.
//
// Tokens and property IDs live in the `global_settings` KV table:
//   ga4_refresh_token  → long-lived, obtained via OAuth
//   ga4_access_token   → short-lived, refreshed on demand
//   ga4_access_expires → unix ms timestamp
//   ga4_property_id    → numeric GA4 property id (override for env default)
//
// The sync cron is idempotent: it upserts into `article_analytics` keyed on
// (entry_id, date) so re-runs backfill any newly-matched articles without
// duplicating rows.
// --------------------------------------------------------------------------

const OAUTH_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];
const REDIRECT_PATH = "/api/ga4/callback";

export type Ga4Status = {
  configured: boolean;
  connected: boolean;
  propertyId: string | null;
  lastSyncedAt: string | null;
};

// --------------------------------------------------------------------------
// global_settings helpers
// --------------------------------------------------------------------------

async function readSetting(key: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("global_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (!data) return null;
  const value = (data as { value: unknown }).value;
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

async function writeSetting(key: string, value: string | null): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("global_settings").upsert(
    { key, value },
    { onConflict: "key" },
  );
}

// --------------------------------------------------------------------------
// Configuration check
// --------------------------------------------------------------------------

export function isGa4Configured(): boolean {
  return Boolean(
    env.GA4_CLIENT_ID &&
      env.GA4_CLIENT_SECRET &&
      env.NEXT_PUBLIC_APP_URL,
  );
}

export function getGa4RedirectUri(): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${REDIRECT_PATH}`;
}

export async function getGa4Status(): Promise<Ga4Status> {
  const configured = isGa4Configured();
  const refreshToken = await readSetting("ga4_refresh_token");
  const propertyIdOverride = await readSetting("ga4_property_id");
  const lastSyncedAt = await readSetting("ga4_last_synced_at");

  return {
    configured,
    connected: Boolean(refreshToken),
    propertyId: propertyIdOverride ?? env.GA4_PROPERTY_ID ?? null,
    lastSyncedAt,
  };
}

// --------------------------------------------------------------------------
// OAuth start + callback
// --------------------------------------------------------------------------

export function buildAuthorizeUrl(state: string): string {
  if (!isGa4Configured()) {
    throw new Error("GA4 is not configured — missing env vars");
  }
  const params = new URLSearchParams({
    client_id: env.GA4_CLIENT_ID as string,
    redirect_uri: getGa4RedirectUri(),
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isGa4Configured()) {
    return { ok: false, error: "GA4 is not configured" };
  }

  const params = new URLSearchParams({
    code,
    client_id: env.GA4_CLIENT_ID as string,
    client_secret: env.GA4_CLIENT_SECRET as string,
    redirect_uri: getGa4RedirectUri(),
    grant_type: "authorization_code",
  });

  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Google rejected token exchange: ${body}` };
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (data.error || !data.refresh_token) {
    return {
      ok: false,
      error: data.error ?? "No refresh token returned from Google",
    };
  }

  await writeSetting("ga4_refresh_token", data.refresh_token);
  if (data.access_token) {
    await writeSetting("ga4_access_token", data.access_token);
  }
  if (data.expires_in) {
    const expiresAt = new Date().getTime() + data.expires_in * 1000;
    await writeSetting("ga4_access_expires", String(expiresAt));
  }

  return { ok: true };
}

export async function disconnectGa4(): Promise<void> {
  await Promise.all([
    writeSetting("ga4_refresh_token", null),
    writeSetting("ga4_access_token", null),
    writeSetting("ga4_access_expires", null),
  ]);
}

// --------------------------------------------------------------------------
// Access token management (refresh on demand)
// --------------------------------------------------------------------------

async function getFreshAccessToken(): Promise<string | null> {
  if (!isGa4Configured()) return null;

  const cached = await readSetting("ga4_access_token");
  const expiresRaw = await readSetting("ga4_access_expires");
  const expires = expiresRaw ? Number(expiresRaw) : 0;

  // Leave a 60s margin so a slow downstream call doesn't die mid-request.
  if (cached && expires && expires - 60_000 > new Date().getTime()) {
    return cached;
  }

  const refreshToken = await readSetting("ga4_refresh_token");
  if (!refreshToken) return null;

  const params = new URLSearchParams({
    client_id: env.GA4_CLIENT_ID as string,
    client_secret: env.GA4_CLIENT_SECRET as string,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;

  await writeSetting("ga4_access_token", data.access_token);
  if (data.expires_in) {
    await writeSetting(
      "ga4_access_expires",
      String(new Date().getTime() + data.expires_in * 1000),
    );
  }
  return data.access_token;
}

// --------------------------------------------------------------------------
// GA4 Data API — runReport
// --------------------------------------------------------------------------

type Ga4Row = {
  pagePath: string;
  date: string; // YYYY-MM-DD
  pageviews: number;
  sessions: number;
  avgTimeOnPage: number;
};

async function runGa4Report(
  propertyId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string,
): Promise<Ga4Row[] | null> {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
    dimensions: [{ name: "pagePath" }, { name: "date" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "sessions" },
      { name: "averageSessionDuration" },
    ],
    limit: 100000,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;
  const data = (await res.json()) as {
    rows?: Array<{
      dimensionValues: Array<{ value: string }>;
      metricValues: Array<{ value: string }>;
    }>;
  };

  const out: Ga4Row[] = [];
  for (const row of data.rows ?? []) {
    const pagePath = row.dimensionValues[0]?.value ?? "";
    const dateRaw = row.dimensionValues[1]?.value ?? ""; // YYYYMMDD
    if (!pagePath || dateRaw.length !== 8) continue;
    const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    out.push({
      pagePath,
      date,
      pageviews: Number(row.metricValues[0]?.value ?? 0),
      sessions: Number(row.metricValues[1]?.value ?? 0),
      avgTimeOnPage: Number(row.metricValues[2]?.value ?? 0),
    });
  }
  return out;
}

// --------------------------------------------------------------------------
// Sync job — pulls yesterday by default and upserts article_analytics
// --------------------------------------------------------------------------

export async function syncGa4(
  dateFrom?: string,
  dateTo?: string,
): Promise<
  | { ok: true; rowsUpserted: number; matchedArticles: number }
  | { ok: false; error: string; reason?: "not_configured" | "not_connected" }
> {
  if (!isGa4Configured()) {
    return { ok: false, error: "GA4 is not configured", reason: "not_configured" };
  }

  const status = await getGa4Status();
  if (!status.connected) {
    return { ok: false, error: "GA4 is not connected", reason: "not_connected" };
  }
  if (!status.propertyId) {
    return { ok: false, error: "GA4 property ID is missing" };
  }

  const accessToken = await getFreshAccessToken();
  if (!accessToken) {
    return { ok: false, error: "Failed to obtain GA4 access token" };
  }

  // Default window: yesterday only (the nightly cron runs at 3am local).
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);
  const defaultDate = yesterday.toISOString().slice(0, 10);
  const from = dateFrom ?? defaultDate;
  const to = dateTo ?? defaultDate;

  const rows = await runGa4Report(status.propertyId, accessToken, from, to);
  if (!rows) {
    return { ok: false, error: "Failed to query GA4 Data API" };
  }

  // Match GA4 pagePath → entry_id via wp_post_url
  const supabase = getSupabaseAdmin();
  const { data: entryRows } = await supabase
    .from("entries")
    .select("id, wp_post_url")
    .not("wp_post_url", "is", null);

  const urlToEntry = new Map<string, string>();
  for (const er of (entryRows ?? []) as Array<{
    id: string;
    wp_post_url: string | null;
  }>) {
    if (!er.wp_post_url) continue;
    urlToEntry.set(normaliseUrl(er.wp_post_url), er.id);
  }

  // Aggregate: {entry_id, date} → stats. GA4 reports pagePath, so multiple
  // trailing-slash variants collapse into the same entry. We sum metrics.
  const agg = new Map<
    string,
    {
      entry_id: string;
      date: string;
      pageviews: number;
      sessions: number;
      timeSum: number;
      timeCount: number;
    }
  >();

  for (const r of rows) {
    const normalised = normaliseUrl(r.pagePath);
    const entryId = urlToEntry.get(normalised);
    if (!entryId) continue;
    const key = `${entryId}|${r.date}`;
    const cur = agg.get(key) ?? {
      entry_id: entryId,
      date: r.date,
      pageviews: 0,
      sessions: 0,
      timeSum: 0,
      timeCount: 0,
    };
    cur.pageviews += r.pageviews;
    cur.sessions += r.sessions;
    cur.timeSum += r.avgTimeOnPage * r.pageviews;
    cur.timeCount += r.pageviews;
    agg.set(key, cur);
  }

  const upsertRows = Array.from(agg.values()).map((v) => ({
    entry_id: v.entry_id,
    date: v.date,
    pageviews: v.pageviews,
    sessions: v.sessions,
    avg_time_on_page: v.timeCount > 0 ? v.timeSum / v.timeCount : 0,
    new_users: 0,
    returning_users: 0,
    synced_at: new Date().toISOString(),
  }));

  if (upsertRows.length > 0) {
    const { error } = await supabase
      .from("article_analytics")
      .upsert(upsertRows, { onConflict: "entry_id,date" });
    if (error) {
      return { ok: false, error: `Upsert failed: ${error.message}` };
    }
  }

  await writeSetting("ga4_last_synced_at", new Date().toISOString());

  return {
    ok: true,
    rowsUpserted: upsertRows.length,
    matchedArticles: new Set(upsertRows.map((r) => r.entry_id)).size,
  };
}
