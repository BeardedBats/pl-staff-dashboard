import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isOperations: vi.fn(),
  syncGa4: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  isOperations: mocks.isOperations,
}));

vi.mock("@/lib/analytics/ga4", () => ({
  syncGa4: mocks.syncGa4,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://dashboard.test/api/admin/ga4-backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GA4 backfill route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "operations-user" });
    mocks.isOperations.mockReturnValue(true);
  });

  it("rejects non-Operations users", async () => {
    mocks.isOperations.mockReturnValue(false);

    const response = await POST(
      request({ date_from: "2026-05-17", date_to: "2026-07-28" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.syncGa4).not.toHaveBeenCalled();
  });

  it("reports partial window failures as a failed request", async () => {
    mocks.syncGa4
      .mockResolvedValueOnce({
        ok: true,
        rowsUpserted: 10,
        matchedArticles: 2,
      })
      .mockResolvedValueOnce({
        ok: false,
        error: "GA4 query failed",
      });

    const response = await POST(
      request({ date_from: "2026-05-17", date_to: "2026-06-30" }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      rowsUpserted: 10,
      errors: ["2026-06-01 → 2026-06-30: GA4 query failed"],
    });
  });

  it("returns success when every monthly window completes", async () => {
    mocks.syncGa4.mockResolvedValue({
      ok: true,
      rowsUpserted: 10,
      matchedArticles: 2,
    });

    const response = await POST(
      request({ date_from: "2026-05-17", date_to: "2026-07-28" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      rowsUpserted: 30,
      monthsProcessed: 3,
      errors: [],
    });
  });
});
