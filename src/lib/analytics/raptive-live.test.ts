import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  listSites: vi.fn(),
  getBounds: vi.fn(),
  getPerformance: vi.fn(),
  matchRows: vi.fn(),
  recordAlert: vi.fn(),
  resolveAlert: vi.fn(),
  emitLog: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    RAPTIVE_CLIENT_ID: "client-id",
    RAPTIVE_CLIENT_SECRET: "client-secret",
    WP_PL_URL: "https://pitcherlist.com",
    WP_QB_URL: "https://pitcherlist.com/qb",
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/lib/analytics/raptive-api", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/analytics/raptive-api")
  >();
  return {
    ...original,
    isRaptiveApiConfigured: () => true,
    listRaptiveSites: mocks.listSites,
    getRaptiveDateBounds: mocks.getBounds,
    getRaptivePagePerformance: mocks.getPerformance,
  };
});
vi.mock("@/lib/analytics/raptive", () => ({
  matchRaptiveRowsToEntries: mocks.matchRows,
}));
vi.mock("@/lib/observability/alerts", () => ({
  recordOperationalAlert: mocks.recordAlert,
  resolveOperationalAlert: mocks.resolveAlert,
}));
vi.mock("@/lib/observability/structured-log", () => ({
  emitStructuredLog: mocks.emitLog,
  safeErrorCode: (error: unknown, fallback: string) =>
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : fallback,
}));

import {
  configureRaptiveSite,
  getRaptiveLiveStatus,
  syncRaptiveConnection,
  type RaptiveConnection,
} from "./raptive-live";

const connection: RaptiveConnection = {
  wpSite: "pl",
  raptiveSiteId: "site-1",
  siteName: "Pitcher List",
  siteUrl: "https://pitcherlist.com",
  enabled: true,
  configuredAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
  lastAttemptedDate: null,
  lastSuccessfulDate: null,
  lastSyncedAt: null,
  lastRowCount: null,
  lastEarnings: null,
  lastErrorCode: null,
};

const activeSite = {
  id: "site-1",
  name: "Pitcher List",
  status: "Active",
  service: "AdThrive",
  jw: true,
  url: "https://pitcherlist.com",
};

const completeBounds = {
  analyticsDateBounds: {
    range: { startDate: "2026-01-01", endDate: "2026-07-20" },
  },
  earningsDateBounds: {
    range: { startDate: "2026-01-01", endDate: "2026-07-21" },
  },
};

function apiRow(
  pageUrl: string | null,
  earnings: number,
  pageviews = 100,
  rpm: number | null = 5,
) {
  return {
    pageUrl,
    siteUrl: "https://pitcherlist.com",
    impressions: 200,
    earnings,
    pageviews,
    pageviewsPercent: 10,
    rpm,
    viewability: { value: 70 },
    cpm: { value: 2, score: 50 },
    impressionsPerPageview: { value: 2, score: 50 },
    author: null,
  };
}

describe("Raptive live synchronization", () => {
  it("preserves all null-URL earnings separately from the homepage", async () => {
    mocks.getPerformance.mockResolvedValue([apiRow(null, 2), apiRow(null, 2), apiRow("/", 3)]);
    const result = await syncRaptiveConnection(connection, "2026-07-20");
    expect(result.ok).toBe(true);
    expect(mocks.matchRows).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ page_url: "raptive:unattributed:pl:2026-07-20", earnings: 4 }),
      expect.objectContaining({ page_url: "/", earnings: 3 }),
    ]), "pl");
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listSites.mockResolvedValue([activeSite]);
    mocks.getBounds.mockResolvedValue(completeBounds);
    mocks.getPerformance.mockResolvedValue([
      apiRow("https://pitcherlist.com/a/", 1),
      apiRow("https://pitcherlist.com/b/", 2),
    ]);
    mocks.matchRows.mockImplementation(async (rows) => ({
      matched: rows.map((row: object, index: number) => ({
        ...row,
        entry_id: `entry-${index + 1}`,
      })),
      matchedCount: rows.length,
      unmatchedCount: 0,
      sampleUnmatched: [],
    }));
    mocks.rpc.mockResolvedValue({ data: 2, error: null });
    mocks.recordAlert.mockResolvedValue("alert-1");
    mocks.resolveAlert.mockResolvedValue(true);
  });

  it("refuses to map a credential site to a different WordPress host", async () => {
    mocks.listSites.mockResolvedValue([
      { ...activeSite, id: "other", url: "https://example.com" },
    ]);

    await expect(
      configureRaptiveSite("pl", "other", "operations-1"),
    ).rejects.toMatchObject({ code: "raptive_site_host_mismatch" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("saves an accessible active site disabled for explicit review", async () => {
    const row = {
      wp_site: "pl",
      raptive_site_id: "site-1",
      site_name: "Pitcher List",
      site_url: "https://pitcherlist.com",
      enabled: false,
      configured_at: "2026-07-22T00:00:00.000Z",
      updated_at: "2026-07-22T00:00:00.000Z",
      last_attempted_date: null,
      last_successful_date: null,
      last_synced_at: null,
      last_row_count: null,
      last_earnings: null,
      last_error_code: null,
    };
    mocks.rpc.mockResolvedValueOnce({ data: row, error: null });

    await expect(
      configureRaptiveSite("pl", "site-1", "operations-1"),
    ).resolves.toMatchObject({ enabled: false, raptiveSiteId: "site-1" });
    expect(mocks.rpc).toHaveBeenCalledWith("configure_raptive_connection", {
      p_wp_site: "pl",
      p_raptive_site_id: "site-1",
      p_site_name: "Pitcher List",
      p_site_url: "https://pitcherlist.com",
      p_configured_by: "operations-1",
    });
  });

  it("uses the latest date complete in both datasets and commits one day atomically", async () => {
    const result = await syncRaptiveConnection(connection);

    expect(result).toEqual({
      ok: true,
      wpSite: "pl",
      date: "2026-07-20",
      apiRows: 2,
      insertedRows: 2,
      matchedRows: 2,
      unmatchedRows: 0,
      totalEarnings: 3,
    });
    expect(mocks.getPerformance).toHaveBeenCalledWith("site-1", "2026-07-20");
    expect(mocks.matchRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-07-20",
          page_rpm: 5,
          sessions: 0,
        }),
      ]),
      "pl",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "commit_raptive_live_sync",
      expect.objectContaining({
        p_wp_site: "pl",
        p_sync_date: "2026-07-20",
        p_summary: expect.objectContaining({
          api_rows: 2,
          canonical_rows: 2,
          total_earnings: 3,
        }),
      }),
    );
    expect(mocks.resolveAlert).toHaveBeenCalled();
  });

  it("keeps the site homepage in daily totals as an unmatched row", async () => {
    mocks.getPerformance.mockResolvedValue([
      apiRow("/", 1),
      apiRow("/article/", 2),
    ]);
    mocks.matchRows.mockImplementation(async (rows) => ({
      matched: rows.map((row: { page_url: string }, index: number) => ({
        ...row,
        entry_id: index === 0 ? null : "entry-1",
      })),
      matchedCount: 1,
      unmatchedCount: 1,
      sampleUnmatched: ["/"],
    }));

    await expect(syncRaptiveConnection(connection)).resolves.toMatchObject({
      ok: true,
      apiRows: 2,
      insertedRows: 2,
      matchedRows: 1,
      unmatchedRows: 1,
      totalEarnings: 3,
    });
    expect(mocks.matchRows).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ page_url: "/" })]),
      "pl",
    );
  });

  it("reports earnings at the same four-decimal precision persisted by the database", async () => {
    mocks.getPerformance.mockResolvedValue([
      apiRow("/a/", 0.1),
      apiRow("/b/", 0.2),
    ]);

    await expect(syncRaptiveConnection(connection)).resolves.toMatchObject({
      ok: true,
      totalEarnings: 0.3,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "commit_raptive_live_sync",
      expect.objectContaining({
        p_summary: expect.objectContaining({ total_earnings: 0.3 }),
      }),
    );
  });

  it("refuses a date outside either documented availability range", async () => {
    const result = await syncRaptiveConnection(connection, "2025-12-31");

    expect(result).toMatchObject({
      ok: false,
      errorCode: "raptive_date_unavailable",
    });
    expect(mocks.getPerformance).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "fail_raptive_live_sync",
      expect.objectContaining({ p_sync_date: "2025-12-31" }),
    );
  });

  it("rechecks the WordPress resource host before every live sync", async () => {
    const result = await syncRaptiveConnection({
      ...connection,
      siteUrl: "https://example.com",
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: "raptive_site_host_changed",
    });
    expect(mocks.getBounds).not.toHaveBeenCalled();
    expect(mocks.getPerformance).not.toHaveBeenCalled();
  });

  it("aggregates conflicting normalized page variants before one atomic commit", async () => {
    mocks.getPerformance.mockResolvedValue([
      apiRow("https://pitcherlist.com/a/", 1, 100, null),
      apiRow("https://www.pitcherlist.com/a", 2, 400, 5),
    ]);
    mocks.rpc.mockResolvedValueOnce({ data: 1, error: null });

    const result = await syncRaptiveConnection(connection, "2026-07-20");

    expect(result).toMatchObject({
      ok: true,
      apiRows: 2,
      insertedRows: 1,
      totalEarnings: 3,
    });
    expect(mocks.matchRows).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          earnings: 3,
          pageviews: 500,
          rpm: 6,
          page_rpm: 6,
        }),
      ],
      "pl",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "commit_raptive_live_sync",
      expect.objectContaining({
        p_rows: [
          expect.objectContaining({ earnings: 3, pageviews: 500, rpm: 6 }),
        ],
      }),
    );
  });

  it("reports migration readiness without exposing a database error", async () => {
    const order = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "relation raptive_connections does not exist" },
    });
    const select = vi.fn(() => ({ order }));
    mocks.from.mockReturnValue({ select });

    await expect(getRaptiveLiveStatus()).resolves.toEqual({
      configured: true,
      databaseReady: false,
      connections: [],
    });
  });
});
