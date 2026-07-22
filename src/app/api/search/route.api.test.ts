import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const { getCurrentUser, searchDashboard } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  searchDashboard: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser }));
vi.mock("@/lib/search/dashboard", () => ({ searchDashboard }));

import { GET } from "./route";

const viewer = {
  id: "10000000-0000-4000-8000-000000000001",
  roles: ["writer"],
} as CurrentUser;

describe("GET /api/search", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    searchDashboard.mockReset();
  });

  it("rejects anonymous requests before searching", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/search?q=staff"));

    expect(response.status).toBe(401);
    expect(searchDashboard).not.toHaveBeenCalled();
  });

  it("rejects short and oversized queries", async () => {
    getCurrentUser.mockResolvedValue(viewer);

    const short = await GET(new Request("http://localhost/api/search?q=x"));
    const long = await GET(
      new Request(`http://localhost/api/search?q=${"x".repeat(81)}`),
    );

    expect(short.status).toBe(400);
    expect(long.status).toBe(400);
    expect(searchDashboard).not.toHaveBeenCalled();
  });

  it("returns the authorization-filtered search response", async () => {
    getCurrentUser.mockResolvedValue(viewer);
    searchDashboard.mockResolvedValue({
      query: "bullpen",
      results: [],
      partial: true,
      unavailableKinds: ["graphic"],
    });

    const response = await GET(
      new Request("http://localhost/api/search?q=%20bullpen%20&limit=4"),
    );

    expect(response.status).toBe(200);
    expect(searchDashboard).toHaveBeenCalledWith(viewer, "bullpen", 4);
    await expect(response.json()).resolves.toMatchObject({
      query: "bullpen",
      partial: true,
    });
  });
});
