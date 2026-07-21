import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readAccessTokenFromCookies: vi.fn(),
  verifyAccessToken: vi.fn(),
  hashToken: vi.fn(),
  isCurrentAccessSession: vi.fn(),
  from: vi.fn(),
  sessionRepository: { kind: "session-repository" },
}));

vi.mock("@/lib/auth/session", () => ({
  readAccessTokenFromCookies: mocks.readAccessTokenFromCookies,
  verifyAccessToken: mocks.verifyAccessToken,
  hashToken: mocks.hashToken,
}));
vi.mock("@/lib/auth/session-lifecycle", () => ({
  isCurrentAccessSession: mocks.isCurrentAccessSession,
}));
vi.mock("@/lib/auth/session-repository", () => ({
  sessionRepository: mocks.sessionRepository,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

import { getCurrentUser } from "./current-user";

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAccessTokenFromCookies.mockResolvedValue("access-token");
    mocks.verifyAccessToken.mockReturnValue({
      sub: "user-1",
      sid: "session-1",
      kind: "access",
    });
    mocks.hashToken.mockReturnValue("access-hash");
  });

  it("returns null without an access cookie", async () => {
    mocks.readAccessTokenFromCookies.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
    expect(mocks.isCurrentAccessSession).not.toHaveBeenCalled();
  });

  it("returns null for a signed payload missing its session identity", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "user-1", kind: "access" });

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.isCurrentAccessSession).not.toHaveBeenCalled();
  });

  it("rejects a valid JWT whose server-side access credential is stale", async () => {
    mocks.isCurrentAccessSession.mockResolvedValue(false);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.isCurrentAccessSession).toHaveBeenCalledWith(
      mocks.sessionRepository,
      {
        sessionId: "session-1",
        userId: "user-1",
        accessTokenHash: "access-hash",
        now: expect.any(Date),
      },
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("resolves profile and deduplicated roles only for a current session", async () => {
    mocks.isCurrentAccessSession.mockResolvedValue(true);
    const userQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "user-1",
          wp_user_id: 42,
          wp_site: "both",
          email: "staff@example.com",
          display_name: "Staff",
          avatar_url: null,
          bio: null,
          timezone: "UTC",
          theme: "dark",
          can_publish: false,
          onboarding_completed: true,
        },
        error: null,
      }),
    };
    userQuery.select.mockReturnValue(userQuery);
    userQuery.eq.mockReturnValue(userQuery);
    const roleQuery = {
      select: vi.fn(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { role: "writer", site: "pl" },
          { role: "writer", site: "qb" },
          { role: "editor", site: "qb" },
        ],
      }),
    };
    roleQuery.select.mockReturnValue(roleQuery);
    mocks.from
      .mockReturnValueOnce(userQuery)
      .mockReturnValueOnce(roleQuery);

    await expect(getCurrentUser()).resolves.toMatchObject({
      id: "user-1",
      roles: ["writer", "editor"],
      role_rows: [
        { role: "writer", site: "pl" },
        { role: "writer", site: "qb" },
        { role: "editor", site: "qb" },
      ],
      session_id: "session-1",
    });
    expect(mocks.from).toHaveBeenNthCalledWith(1, "users");
    expect(mocks.from).toHaveBeenNthCalledWith(2, "user_roles");
  });
});
