import "server-only";

import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRaptiveDateBounds,
  getRaptivePagePerformance,
  isRaptiveApiConfigured,
  listRaptiveSites,
  RaptiveApiError,
  type RaptiveSite,
} from "@/lib/analytics/raptive-api";
import {
  matchRaptiveRowsToEntries,
  type RaptiveParsedRow,
} from "@/lib/analytics/raptive";
import { normalizeAnalyticsPath } from "@/lib/analytics/url-normalization";
import {
  recordOperationalAlert,
  resolveOperationalAlert,
} from "@/lib/observability/alerts";
import {
  emitStructuredLog,
  safeErrorCode,
} from "@/lib/observability/structured-log";

export type RaptiveConnection = {
  wpSite: "pl" | "qb";
  raptiveSiteId: string;
  siteName: string;
  siteUrl: string;
  enabled: boolean;
  configuredAt: string;
  updatedAt: string;
  lastAttemptedDate: string | null;
  lastSuccessfulDate: string | null;
  lastSyncedAt: string | null;
  lastRowCount: number | null;
  lastEarnings: number | null;
  lastErrorCode: string | null;
};

export type RaptiveLiveStatus = {
  configured: boolean;
  databaseReady: boolean;
  connections: RaptiveConnection[];
};

type ConnectionRow = {
  wp_site: "pl" | "qb";
  raptive_site_id: string;
  site_name: string;
  site_url: string;
  enabled: boolean;
  configured_at: string;
  updated_at: string;
  last_attempted_date: string | null;
  last_successful_date: string | null;
  last_synced_at: string | null;
  last_row_count: number | null;
  last_earnings: number | string | null;
  last_error_code: string | null;
};

function toConnection(row: ConnectionRow): RaptiveConnection {
  return {
    wpSite: row.wp_site,
    raptiveSiteId: row.raptive_site_id,
    siteName: row.site_name,
    siteUrl: row.site_url,
    enabled: row.enabled,
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
    lastAttemptedDate: row.last_attempted_date,
    lastSuccessfulDate: row.last_successful_date,
    lastSyncedAt: row.last_synced_at,
    lastRowCount: row.last_row_count,
    lastEarnings:
      row.last_earnings === null ? null : Number(row.last_earnings),
    lastErrorCode: row.last_error_code,
  };
}

export async function getRaptiveLiveStatus(): Promise<RaptiveLiveStatus> {
  if (!isRaptiveApiConfigured()) {
    return { configured: false, databaseReady: true, connections: [] };
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("raptive_connections")
    .select(
      "wp_site,raptive_site_id,site_name,site_url,enabled,configured_at,updated_at,last_attempted_date,last_successful_date,last_synced_at,last_row_count,last_earnings,last_error_code",
    )
    .order("wp_site");
  if (error) {
    return { configured: true, databaseReady: false, connections: [] };
  }
  return {
    configured: true,
    databaseReady: true,
    connections: ((data ?? []) as ConnectionRow[]).map(toConnection),
  };
}

export async function discoverRaptiveSites(): Promise<RaptiveSite[]> {
  return listRaptiveSites();
}

function expectedWordPressHost(site: "pl" | "qb"): string | null {
  const raw = site === "pl" ? env.WP_PL_URL : env.WP_QB_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function urlHost(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function siteHost(site: RaptiveSite): string | null {
  return urlHost(site.url);
}

export async function configureRaptiveSite(
  wpSite: "pl" | "qb",
  raptiveSiteId: string,
  configuredBy: string,
): Promise<RaptiveConnection> {
  const sites = await listRaptiveSites();
  const selected = sites.find((site) => site.id === raptiveSiteId);
  if (!selected) {
    throw Object.assign(new Error("Selected Raptive site is not accessible"), {
      code: "raptive_site_not_accessible",
    });
  }
  if (selected.status !== "Active") {
    throw Object.assign(new Error("Selected Raptive site is not active"), {
      code: "raptive_site_not_active",
    });
  }
  const expectedHost = expectedWordPressHost(wpSite);
  const actualHost = siteHost(selected);
  if (!expectedHost || !actualHost || expectedHost !== actualHost) {
    throw Object.assign(
      new Error("Raptive site does not match the selected dashboard site"),
      { code: "raptive_site_host_mismatch" },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("configure_raptive_connection", {
    p_wp_site: wpSite,
    p_raptive_site_id: selected.id,
    p_site_name: selected.name,
    p_site_url: selected.url!,
    p_configured_by: configuredBy,
  });
  if (error || !data) {
    throw Object.assign(new Error("Raptive connection could not be saved"), {
      code: "raptive_connection_save_failed",
    });
  }
  return toConnection(data as unknown as ConnectionRow);
}

export async function setRaptiveSiteEnabled(
  wpSite: "pl" | "qb",
  enabled: boolean,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc(
    "set_raptive_connection_enabled",
    { p_wp_site: wpSite, p_enabled: enabled },
  );
  return !error && data === true;
}

function dateInside(
  date: string,
  range: { startDate: string | null; endDate: string | null },
): boolean {
  return Boolean(
    range.startDate &&
      range.endDate &&
      date >= range.startDate &&
      date <= range.endDate,
  );
}

function latestCompleteDate(
  analytics: { startDate: string | null; endDate: string | null },
  earnings: { startDate: string | null; endDate: string | null },
): string | null {
  if (!analytics.endDate || !earnings.endDate) return null;
  const date = analytics.endDate < earnings.endDate
    ? analytics.endDate
    : earnings.endDate;
  return dateInside(date, analytics) && dateInside(date, earnings) ? date : null;
}

function canonicalizeApiRows(
  date: string,
  rows: Awaited<ReturnType<typeof getRaptivePagePerformance>>,
): RaptiveParsedRow[] {
  const byPath = new Map<string, RaptiveParsedRow>();
  for (const row of rows) {
    const path = normalizeAnalyticsPath(row.pageUrl);
    if (!path && !row.pageUrl.trim()) {
      throw Object.assign(new Error("Raptive returned an invalid page URL"), {
        code: "raptive_page_url_invalid",
      });
    }
    // The site homepage legitimately normalizes to an empty article path. Keep
    // it in the daily totals as an unmatched row and deduplicate root variants.
    const canonicalPath = path || "\0homepage";
    const canonical: RaptiveParsedRow = {
      date,
      page_url: row.pageUrl,
      earnings: row.earnings,
      rpm: row.rpm,
      page_rpm: row.rpm,
      sessions: 0,
      pageviews: row.pageviews,
    };
    const existing = byPath.get(canonicalPath);
    if (existing) {
      if (
        existing.earnings !== canonical.earnings ||
        existing.rpm !== canonical.rpm ||
        existing.pageviews !== canonical.pageviews
      ) {
        throw Object.assign(
          new Error("Raptive returned conflicting rows for one page"),
          { code: "raptive_duplicate_conflict" },
        );
      }
      continue;
    }
    byPath.set(canonicalPath, canonical);
  }
  return [...byPath.values()];
}

async function recordSyncFailure(
  connection: RaptiveConnection,
  date: string,
  error: unknown,
): Promise<string> {
  const errorCode =
    error instanceof RaptiveApiError
      ? error.code
      : safeErrorCode(error, "raptive_sync_failed");
  const supabase = getSupabaseAdmin();
  await supabase.rpc("fail_raptive_live_sync", {
    p_wp_site: connection.wpSite,
    p_raptive_site_id: connection.raptiveSiteId,
    p_sync_date: date,
    p_error_code: errorCode,
  });
  await recordOperationalAlert(
    {
      fingerprint: `integration:raptive:${connection.wpSite}`,
      severity: "warning",
      component: "raptive",
      eventName: "raptive.sync_failed",
      errorCode,
      summary: `Raptive live sync failed for ${connection.siteName}.`,
      remediation:
        "Open Settings > Analytics, confirm the connection and retry the affected date once.",
      metadata: { site: connection.wpSite, date },
    },
    error,
  );
  return errorCode;
}

export type RaptiveSyncResult =
  | {
      ok: true;
      wpSite: "pl" | "qb";
      date: string;
      apiRows: number;
      insertedRows: number;
      matchedRows: number;
      unmatchedRows: number;
      totalEarnings: number;
    }
  | {
      ok: false;
      wpSite: "pl" | "qb";
      date: string;
      error: string;
      errorCode: string;
    };

export async function syncRaptiveConnection(
  connection: RaptiveConnection,
  requestedDate?: string,
): Promise<RaptiveSyncResult> {
  let syncDate = requestedDate ?? new Date().toISOString().slice(0, 10);
  try {
    if (!connection.enabled) {
      throw Object.assign(new Error("Raptive connection is disabled"), {
        code: "raptive_connection_disabled",
      });
    }
    const sites = await listRaptiveSites();
    const site = sites.find((item) => item.id === connection.raptiveSiteId);
    if (!site || site.status !== "Active") {
      throw Object.assign(new Error("Configured Raptive site is unavailable"), {
        code: "raptive_site_not_accessible",
      });
    }
    const remoteHost = siteHost(site);
    const storedHost = urlHost(connection.siteUrl);
    const expectedHost = expectedWordPressHost(connection.wpSite);
    if (
      !remoteHost ||
      !storedHost ||
      !expectedHost ||
      remoteHost !== storedHost ||
      remoteHost !== expectedHost
    ) {
      throw Object.assign(new Error("Configured Raptive site host changed"), {
        code: "raptive_site_host_changed",
      });
    }

    const bounds = await getRaptiveDateBounds(connection.raptiveSiteId);
    const analyticsRange = bounds.analyticsDateBounds.range;
    const earningsRange = bounds.earningsDateBounds.range;
    if (!requestedDate) {
      const latest = latestCompleteDate(analyticsRange, earningsRange);
      if (!latest) {
        throw Object.assign(new Error("No complete Raptive date is available"), {
          code: "raptive_date_unavailable",
        });
      }
      syncDate = latest;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(syncDate) ||
      !dateInside(syncDate, analyticsRange) ||
      !dateInside(syncDate, earningsRange)
    ) {
      throw Object.assign(new Error("Requested Raptive date is unavailable"), {
        code: "raptive_date_unavailable",
      });
    }

    const apiRows = await getRaptivePagePerformance(
      connection.raptiveSiteId,
      syncDate,
    );
    const canonicalRows = canonicalizeApiRows(syncDate, apiRows);
    const matched = await matchRaptiveRowsToEntries(
      canonicalRows,
      connection.wpSite,
    );
    // Match raptive_connections.last_earnings NUMERIC(14,4) so the API result,
    // reconciliation summary, and persisted status expose one stable total.
    const rawTotalEarnings = canonicalRows.reduce(
      (total, row) => total + row.earnings,
      0,
    );
    const totalEarnings = Number(rawTotalEarnings.toFixed(4));
    const supabase = getSupabaseAdmin();
    const { data: insertedRows, error } = await supabase.rpc(
      "commit_raptive_live_sync",
      {
        p_wp_site: connection.wpSite,
        p_raptive_site_id: connection.raptiveSiteId,
        p_sync_date: syncDate,
        p_rows: matched.matched,
        p_summary: {
          api_rows: apiRows.length,
          canonical_rows: canonicalRows.length,
          matched_rows: matched.matchedCount,
          unmatched_rows: matched.unmatchedCount,
          total_earnings: totalEarnings,
        },
      },
    );
    if (error || typeof insertedRows !== "number") {
      throw Object.assign(new Error("Raptive daily commit failed"), {
        code: "raptive_commit_failed",
      });
    }
    if (insertedRows !== canonicalRows.length) {
      throw Object.assign(new Error("Raptive reconciliation failed"), {
        code: "raptive_reconciliation_failed",
      });
    }

    await resolveOperationalAlert(
      `integration:raptive:${connection.wpSite}`,
      "raptive",
    );
    emitStructuredLog({
      level: "info",
      component: "raptive",
      event: "raptive.sync_completed",
      attributes: {
        site: connection.wpSite,
        date: syncDate,
        rows_inserted: insertedRows,
        matched_rows: matched.matchedCount,
        unmatched_rows: matched.unmatchedCount,
      },
    });
    return {
      ok: true,
      wpSite: connection.wpSite,
      date: syncDate,
      apiRows: apiRows.length,
      insertedRows,
      matchedRows: matched.matchedCount,
      unmatchedRows: matched.unmatchedCount,
      totalEarnings,
    };
  } catch (error) {
    const errorCode = await recordSyncFailure(connection, syncDate, error);
    return {
      ok: false,
      wpSite: connection.wpSite,
      date: syncDate,
      error: "Raptive live sync failed",
      errorCode,
    };
  }
}

export async function syncEnabledRaptiveConnections(
  requestedDate?: string,
): Promise<RaptiveSyncResult[]> {
  const status = await getRaptiveLiveStatus();
  if (!status.configured || !status.databaseReady) return [];
  const enabled = status.connections.filter((connection) => connection.enabled);
  const results: RaptiveSyncResult[] = [];
  for (const connection of enabled) {
    results.push(await syncRaptiveConnection(connection, requestedDate));
  }
  return results;
}
