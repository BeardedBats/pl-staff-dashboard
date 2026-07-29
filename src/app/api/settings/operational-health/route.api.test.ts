import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isOperations: vi.fn(),
  isAdminPlusForScope: vi.fn(),
  getOperationalHealth: vi.fn(),
  emitStructuredLog: vi.fn(),
  createErrorId: vi.fn(() => "health-error-id"),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  isOperations: mocks.isOperations,
}));
vi.mock("@/lib/auth/authorization", () => ({
  isAdminPlusForScope: mocks.isAdminPlusForScope,
}));
vi.mock("@/lib/observability/health", () => ({
  getOperationalHealth: mocks.getOperationalHealth,
}));
vi.mock("@/lib/observability/structured-log", () => ({
  emitStructuredLog: mocks.emitStructuredLog,
  createErrorId: mocks.createErrorId,
  safeErrorCode: () => "probe_failed",
}));

import { GET } from "./route";

describe("GET /api/settings/operational-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" });
    mocks.isOperations.mockReturnValue(false);
    mocks.isAdminPlusForScope.mockReturnValue(true);
  });

  it("rejects anonymous requests before probing health", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getOperationalHealth).not.toHaveBeenCalled();
  });

  it("requires both-site admin or Operations authority", async () => {
    mocks.isAdminPlusForScope.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.getOperationalHealth).not.toHaveBeenCalled();
  });

  it("allows Operations without expanding both-site admin authority", async () => {
    mocks.isAdminPlusForScope.mockReturnValue(false);
    mocks.isOperations.mockReturnValue(true);
    const health = {
      generatedAt: "2026-07-29T12:00:00.000Z",
      overall: "healthy",
    };
    mocks.getOperationalHealth.mockResolvedValue(health);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ health });
  });

  it("returns the authorized snapshot", async () => {
    const health = { generatedAt: "2026-07-21T20:00:00.000Z", overall: "healthy" };
    mocks.getOperationalHealth.mockResolvedValue(health);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ health });
  });

  it("returns only a safe error identifier when the snapshot fails", async () => {
    mocks.getOperationalHealth.mockRejectedValue(
      new Error("service key secret-value@example.test"),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Operational health is temporarily unavailable",
      errorId: "health-error-id",
    });
    expect(JSON.stringify(body)).not.toContain("secret-value");
    expect(mocks.emitStructuredLog).toHaveBeenCalledWith(
      expect.objectContaining({ errorId: "health-error-id" }),
    );
  });
});
