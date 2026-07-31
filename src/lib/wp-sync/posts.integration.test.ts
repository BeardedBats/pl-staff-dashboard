import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  fetchAllWpPages: vi.fn(),
  applyWpStateToEntry: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/lib/wp-sync/pagination", () => ({
  fetchAllWpPages: mocks.fetchAllWpPages,
}));
vi.mock("@/lib/entries/status-transitions", () => ({
  applyWpStateToEntry: mocks.applyWpStateToEntry,
}));

import { syncWpPostsForSite } from "./posts";

function maybeSingleQuery(result: unknown, rejects = false) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: rejects
      ? vi.fn().mockRejectedValue(new Error("database failure"))
      : vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function listQuery(result: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

describe("WordPress post reconciliation retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not advance the watermark when an individual post fails", async () => {
    mocks.fetchAllWpPages.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: 42,
          status: "draft",
          author: 7,
          date_gmt: null,
          modified_gmt: "2026-07-21T12:00:00",
          link: null,
          title: { rendered: "Draft" },
        },
      ],
    });
    let settingsReads = 0;
    mocks.from.mockImplementation((table) => {
      if (table === "global_settings") {
        settingsReads += 1;
        if (settingsReads > 1) throw new Error("watermark must not be written");
        return maybeSingleQuery({ data: { value: "2026-07-21T11:00:00Z" } });
      }
      if (table === "tiers") {
        return maybeSingleQuery({ data: { id: "tier-a" } });
      }
      if (table === "wp_sync_backlog") {
        return listQuery({ data: [], error: null });
      }
      if (table === "entries") {
        return maybeSingleQuery(null, true);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const report = await syncWpPostsForSite("pl", "system-user");

    expect(report.errors).toEqual([
      { wpPostId: 42, message: "Failed to process WordPress post" },
    ]);
    expect(settingsReads).toBe(1);
  });

  it("marks connected entries stale when the scheduled WordPress read fails", async () => {
    mocks.fetchAllWpPages.mockResolvedValue({ ok: false, error: "WordPress returned 503" });
    const update = vi.fn();
    const eq = vi.fn();
    const not = vi.fn().mockResolvedValue({ error: null });
    const entriesQuery = { update, eq, not };
    update.mockReturnValue(entriesQuery);
    eq.mockReturnValue(entriesQuery);
    mocks.from.mockImplementation((table) => {
      if (table === "global_settings") {
        return maybeSingleQuery({ data: { value: "2026-07-21T11:00:00Z" } });
      }
      if (table === "entries") return entriesQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const report = await syncWpPostsForSite("pl", "system-user");

    expect(report.errors).toEqual([{ wpPostId: 0, message: "WordPress returned 503" }]);
    expect(update).toHaveBeenCalledWith({
      wp_sync_status: "stale",
      wp_last_sync_error: "WordPress returned 503",
    });
    expect(eq).toHaveBeenCalledWith("site", "pl");
    expect(not).toHaveBeenCalledWith("wp_post_id", "is", null);
  });

  it("queues only the compact recovery fields for an oversized WordPress post", async () => {
    mocks.fetchAllWpPages.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: 97,
          status: "draft",
          author: 700,
          date_gmt: null,
          modified_gmt: "2026-07-30T22:00:00",
          link: "https://pitcherlist.com/large-draft/",
          title: { rendered: "Large draft" },
          content: { raw: "x".repeat(100_000) },
        },
      ],
    });
    let settingsReads = 0;
    mocks.from.mockImplementation((table) => {
      if (table === "global_settings") {
        settingsReads += 1;
        if (settingsReads === 1) {
          return maybeSingleQuery({ data: { value: "2026-07-30T21:00:00Z" } });
        }
        const updateQuery = {
          select: vi.fn(),
          eq: vi.fn(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "setting-id" } }),
          update: vi.fn(),
        };
        updateQuery.select.mockReturnValue(updateQuery);
        updateQuery.eq.mockReturnValue(updateQuery);
        updateQuery.update.mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        });
        return updateQuery;
      }
      if (table === "tiers") {
        return maybeSingleQuery({ data: { id: "tier-a" } });
      }
      if (table === "wp_sync_backlog") {
        return listQuery({ data: [], error: null });
      }
      if (table === "entries") {
        return maybeSingleQuery({ data: null, error: null });
      }
      if (table === "users") {
        return maybeSingleQuery({ data: null, error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    const report = await syncWpPostsForSite("pl", "system-user");

    expect(report.errors).toEqual([]);
    expect(report.skippedNoMatchingUser).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "queue_wp_sync_backlog",
      expect.objectContaining({
        p_payload: {
          id: 97,
          status: "draft",
          author: 700,
          date_gmt: null,
          modified_gmt: "2026-07-30T22:00:00",
          link: "https://pitcherlist.com/large-draft/",
          title: { rendered: "Large draft" },
        },
      }),
    );
  });
});
