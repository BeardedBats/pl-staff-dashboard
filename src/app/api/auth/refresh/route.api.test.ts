import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearAuthCookies: vi.fn(),
  createTokenPair: vi.fn(),
  hashToken: vi.fn(),
  readRefreshTokenFromCookies: vi.fn(),
  setAuthCookies: vi.fn(),
  verifyRefreshToken: vi.fn(),
  rotateRefreshSession: vi.fn(),
  sessionRepository: { kind: "session-repository" },
}));

vi.mock("@/lib/auth/session", () => ({
  clearAuthCookies: mocks.clearAuthCookies,
  createTokenPair: mocks.createTokenPair,
  hashToken: mocks.hashToken,
  readRefreshTokenFromCookies: mocks.readRefreshTokenFromCookies,
  setAuthCookies: mocks.setAuthCookies,
  verifyRefreshToken: mocks.verifyRefreshToken,
}));
vi.mock("@/lib/auth/session-lifecycle", () => ({
  rotateRefreshSession: mocks.rotateRefreshSession,
}));
vi.mock("@/lib/auth/session-repository", () => ({
  sessionRepository: mocks.sessionRepository,
}));

import { POST } from "./route";

const pair = {
  accessToken: "next-access",
  refreshToken: "next-refresh",
  accessTokenHash: "next-access-hash",
  refreshTokenHash: "next-refresh-hash",
  refreshExpiresAt: new Date("2026-07-28T12:00:00.000Z"),
};

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readRefreshTokenFromCookies.mockResolvedValue("current-refresh");
    mocks.verifyRefreshToken.mockReturnValue({
      sub: "user-1",
      sid: "session-1",
      kind: "refresh",
    });
    mocks.hashToken.mockReturnValue("current-refresh-hash");
    mocks.createTokenPair.mockReturnValue(pair);
  });

  it("rejects a missing refresh cookie without attempting rotation", async () => {
    mocks.readRefreshTokenFromCookies.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mocks.rotateRefreshSession).not.toHaveBeenCalled();
    expect(mocks.setAuthCookies).not.toHaveBeenCalled();
  });

  it("clears cookies when the presented token is invalid", async () => {
    mocks.verifyRefreshToken.mockReturnValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "NOT_AUTHENTICATED",
      error: "Invalid refresh token",
    });
    expect(mocks.clearAuthCookies).toHaveBeenCalledOnce();
    expect(mocks.rotateRefreshSession).not.toHaveBeenCalled();
  });

  it.each(["invalid", "expired", "replayed"] as const)(
    "clears cookies when rotation reports %s",
    async (status) => {
      mocks.rotateRefreshSession.mockResolvedValue({ status });

      const response = await POST();

      expect(response.status).toBe(401);
      expect(mocks.clearAuthCookies).toHaveBeenCalledOnce();
      expect(mocks.setAuthCookies).not.toHaveBeenCalled();
    },
  );

  it("rotates through the bound repository and sets only the next pair", async () => {
    mocks.rotateRefreshSession.mockImplementation(async (input) => ({
      status: "rotated",
      pair: input.issueNext().pair,
    }));

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.rotateRefreshSession).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: mocks.sessionRepository,
        sessionId: "session-1",
        userId: "user-1",
        refreshTokenHash: "current-refresh-hash",
        now: expect.any(Date),
        issueNext: expect.any(Function),
      }),
    );
    expect(mocks.setAuthCookies).toHaveBeenCalledWith(pair);
    expect(mocks.clearAuthCookies).not.toHaveBeenCalled();
  });
});
