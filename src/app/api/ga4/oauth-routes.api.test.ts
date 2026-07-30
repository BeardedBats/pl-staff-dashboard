import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isOperations: vi.fn(),
  cookies: vi.fn(),
  buildAuthorizeUrl: vi.fn(),
  isGa4Configured: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  isOperations: mocks.isOperations,
}));
vi.mock("@/lib/analytics/ga4", () => ({
  buildAuthorizeUrl: mocks.buildAuthorizeUrl,
  isGa4Configured: mocks.isGa4Configured,
  exchangeCodeForTokens: mocks.exchangeCodeForTokens,
}));

import { GET as callback } from "./callback/route";
import { POST as connect } from "./connect/route";

describe("GA4 OAuth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "operator-1" });
    mocks.isOperations.mockReturnValue(true);
    mocks.isGa4Configured.mockReturnValue(true);
    mocks.cookies.mockResolvedValue({
      get: mocks.cookieGet,
      set: mocks.cookieSet,
      delete: mocks.cookieDelete,
    });
    mocks.buildAuthorizeUrl.mockImplementation(
      (state: string) => `https://accounts.google.test/oauth?state=${state}`,
    );
    mocks.exchangeCodeForTokens.mockResolvedValue({ ok: true });
  });

  it("binds the authorization state to a secure short-lived cookie", async () => {
    const response = await connect();
    const body = (await response.json()) as { url: string };
    const state = new URL(body.url).searchParams.get("state");

    expect(state).toMatch(/^[a-f0-9]{32}$/);
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "ga4_oauth_state",
      state,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/api/ga4/callback",
        maxAge: 600,
      }),
    );
  });

  it("rejects a callback whose state does not match the browser cookie", async () => {
    mocks.cookieGet.mockReturnValue({ value: "expected-state" });

    const response = await callback(
      new Request(
        "https://dashboard.test/api/ga4/callback?code=code-1&state=wrong-state",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("ga4=error%3Ainvalid_state");
    expect(mocks.exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(mocks.cookieDelete).toHaveBeenCalledWith("ga4_oauth_state");
  });

  it("exchanges a code only after validating state", async () => {
    mocks.cookieGet.mockReturnValue({ value: "matching-state" });

    const response = await callback(
      new Request(
        "https://dashboard.test/api/ga4/callback?code=code-1&state=matching-state",
      ),
    );

    expect(response.headers.get("location")).toContain("ga4=connected");
    expect(mocks.exchangeCodeForTokens).toHaveBeenCalledWith("code-1");
  });
});
