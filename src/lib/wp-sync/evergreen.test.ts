import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

import { listEvergreenCandidates } from "./evergreen";

describe("evergreen refresh identification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses age and WordPress-change thresholds without traffic data", async () => {
    const calls: Array<[string, string]> = [];
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      not: vi.fn(),
      lte: vi.fn((field: string, value: string) => {
        calls.push([field, value]);
        return query;
      }),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: "entry-1",
            title: "Refresh me",
            site: "pl",
            wp_post_url: "https://example.test/post",
            published_at: "2024-01-01T00:00:00Z",
            wp_modified_at: "2024-06-01T00:00:00Z",
          },
        ],
        error: null,
      }),
    };
    for (const method of ["select", "eq", "not", "order"] as const) {
      query[method].mockReturnValue(query);
    }
    mocks.from.mockReturnValue(query);

    const rows = await listEvergreenCandidates(
      new Date("2026-07-22T00:00:00Z"),
      8,
    );

    expect(calls).toEqual([
      ["published_at", "2025-07-22T00:00:00.000Z"],
      ["wp_modified_at", "2026-01-23T00:00:00.000Z"],
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ id: "entry-1", title: "Refresh me" }),
    ]);
  });
});
