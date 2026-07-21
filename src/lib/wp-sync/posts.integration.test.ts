import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  fetchAllWpPages: vi.fn(),
  applyWpStateToEntry: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
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
});
