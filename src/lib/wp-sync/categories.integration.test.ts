import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  fetchAllWpPages: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/wp-sync/pagination", () => ({
  fetchAllWpPages: mocks.fetchAllWpPages,
}));

import { syncWpCategoriesForSite } from "./categories";

describe("WordPress category reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not create, update, or deactivate from a partial remote snapshot", async () => {
    mocks.fetchAllWpPages.mockResolvedValue({
      ok: false,
      error: "WP returned 503",
    });

    await expect(syncWpCategoriesForSite("pl")).resolves.toEqual({
      site: "pl",
      fetched: 0,
      created: 0,
      updated: 0,
      deactivated: 0,
      errors: ["WP returned 503"],
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reports a failed write without claiming the category was created", async () => {
    mocks.fetchAllWpPages.mockResolvedValue({
      ok: true,
      rows: [{ id: 42, name: "Pitching" }],
    });
    const existingQuery = { select: vi.fn(), eq: vi.fn() };
    existingQuery.select.mockReturnValue(existingQuery);
    existingQuery.eq.mockResolvedValue({ data: [] });
    const insert = vi.fn().mockResolvedValue({ error: { code: "db_error" } });
    mocks.from
      .mockReturnValueOnce(existingQuery)
      .mockReturnValueOnce({ insert });

    const report = await syncWpCategoriesForSite("pl");

    expect(report.created).toBe(0);
    expect(report.errors).toEqual(["Failed to create category 42"]);
  });
});
