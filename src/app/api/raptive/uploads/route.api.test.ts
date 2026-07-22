import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canViewAnalytics: vi.fn(),
  listUploads: vi.fn(),
  listRuns: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  canViewAnalytics: mocks.canViewAnalytics,
}));
vi.mock("@/lib/analytics/raptive", () => ({
  listRaptiveUploads: mocks.listUploads,
  listRaptiveImportRuns: mocks.listRuns,
}));

import { GET } from "./route";

describe("GET /api/raptive/uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "eic-1" });
    mocks.canViewAnalytics.mockReturnValue(true);
    mocks.listUploads.mockResolvedValue([{ id: "upload-1" }]);
    mocks.listRuns.mockResolvedValue([{ id: "run-1", status: "failed" }]);
  });

  it("rejects anonymous and unauthorized viewers before reading history", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);

    mocks.getCurrentUser.mockResolvedValueOnce({ id: "writer-1" });
    mocks.canViewAnalytics.mockReturnValue(false);
    expect((await GET()).status).toBe(403);
    expect(mocks.listUploads).not.toHaveBeenCalled();
    expect(mocks.listRuns).not.toHaveBeenCalled();
  });

  it("returns successful uploads and every durable import attempt", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      uploads: [{ id: "upload-1" }],
      runs: [{ id: "run-1", status: "failed" }],
    });
  });
});
