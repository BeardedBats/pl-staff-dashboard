import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearAuthCookies: vi.fn(),
  readAccessTokenFromCookies: vi.fn(),
  readRefreshTokenFromCookies: vi.fn(),
  verifyAccessToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  clearAuthCookies: mocks.clearAuthCookies,
  readAccessTokenFromCookies: mocks.readAccessTokenFromCookies,
  readRefreshTokenFromCookies: mocks.readRefreshTokenFromCookies,
  verifyAccessToken: mocks.verifyAccessToken,
  verifyRefreshToken: mocks.verifyRefreshToken,
}));
vi.mock("@/lib/auth/session-repository", () => ({
  sessionRepository: { revoke: mocks.revoke },
}));

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAccessTokenFromCookies.mockResolvedValue(null);
    mocks.readRefreshTokenFromCookies.mockResolvedValue(null);
  });

  it("is idempotent without cookies and still clears the browser state", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.clearAuthCookies).toHaveBeenCalledOnce();
  });

  it("revokes a refresh-backed session when access is absent", async () => {
    mocks.readRefreshTokenFromCookies.mockResolvedValue("refresh");
    mocks.verifyRefreshToken.mockReturnValue({
      sid: "session-1",
      sub: "user-1",
      kind: "refresh",
    });

    await POST();

    expect(mocks.revoke).toHaveBeenCalledOnce();
    expect(mocks.revoke).toHaveBeenCalledWith("session-1", "user-1");
    expect(mocks.clearAuthCookies).toHaveBeenCalledOnce();
  });

  it("deduplicates access and refresh cookies from one token family", async () => {
    mocks.readAccessTokenFromCookies.mockResolvedValue("access");
    mocks.readRefreshTokenFromCookies.mockResolvedValue("refresh");
    mocks.verifyAccessToken.mockReturnValue({ sid: "session-1", sub: "user-1" });
    mocks.verifyRefreshToken.mockReturnValue({
      sid: "session-1",
      sub: "user-1",
    });

    await POST();

    expect(mocks.revoke).toHaveBeenCalledOnce();
  });

  it("clears cookies even when server-side revocation fails", async () => {
    mocks.readAccessTokenFromCookies.mockResolvedValue("access");
    mocks.verifyAccessToken.mockReturnValue({ sid: "session-1", sub: "user-1" });
    mocks.revoke.mockRejectedValue(new Error("database unavailable"));

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.clearAuthCookies).toHaveBeenCalledOnce();
  });
});
