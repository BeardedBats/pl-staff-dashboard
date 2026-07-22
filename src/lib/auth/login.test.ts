import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  validateWpAnywhere: vi.fn(),
  createTokenPair: vi.fn(),
  setAuthCookies: vi.fn(),
  roleInsert: vi.fn(),
  sessionInsert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/auth/wordpress", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/wordpress")>()),
  validateWpAnywhere: mocks.validateWpAnywhere,
}));
vi.mock("@/lib/auth/session", () => ({
  createTokenPair: mocks.createTokenPair,
  setAuthCookies: mocks.setAuthCookies,
}));

import { performLogin } from "./login";

const tokenPair = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenHash: "access-hash",
  refreshTokenHash: "refresh-hash",
  refreshExpiresAt: new Date("2026-07-28T12:00:00.000Z"),
};

function wpUser(wpRoles: string[]) {
  return {
    id: 42,
    username: "staffer",
    name: "Staff Member",
    email: "STAFFER@example.com",
    avatar_url: null,
    wp_roles: wpRoles,
    description: "",
  };
}

function makeLookup(result: { data: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  return query;
}

function makeCreateUser() {
  const query = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: "10000000-0000-4000-8000-000000000001",
        email: "staffer@example.com",
        display_name: "Staff Member",
        wp_site: "pl",
        onboarding_completed: false,
      },
      error: null,
    }),
  };
  query.insert.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

describe("performLogin staff authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTokenPair.mockReturnValue(tokenPair);
    mocks.roleInsert.mockResolvedValue({ error: null });
    mocks.sessionInsert.mockResolvedValue({ error: null });
  });

  it("rejects a valid non-staff WordPress account before database access", async () => {
    mocks.validateWpAnywhere.mockResolvedValue({
      ok: true,
      site: "pl",
      user: wpUser(["subscriber"]),
    });

    const result = await performLogin("subscriber", "application-password");

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Your WordPress account does not have an eligible staff role.",
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.createTokenPair).not.toHaveBeenCalled();
    expect(mocks.setAuthCookies).not.toHaveBeenCalled();
  });

  it("maps a new WordPress author to the canonical writer role", async () => {
    mocks.validateWpAnywhere.mockResolvedValue({
      ok: true,
      site: "pl",
      user: wpUser(["author"]),
    });
    const userQueries = [
      makeLookup({ data: null }),
      makeLookup({ data: null }),
      makeCreateUser(),
    ];
    mocks.from.mockImplementation((table) => {
      if (table === "users") return userQueries.shift();
      if (table === "user_roles") return { insert: mocks.roleInsert };
      if (table === "sessions") return { insert: mocks.sessionInsert };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await performLogin("staffer", "application-password");

    expect(result).toMatchObject({
      ok: true,
      user: {
        id: "10000000-0000-4000-8000-000000000001",
        email: "staffer@example.com",
        wp_site: "pl",
      },
    });
    expect(mocks.roleInsert).toHaveBeenCalledWith({
      user_id: "10000000-0000-4000-8000-000000000001",
      role: "writer",
      site: "pl",
    });
    expect(mocks.sessionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "10000000-0000-4000-8000-000000000001",
        token_hash: "access-hash",
        refresh_token_hash: "refresh-hash",
        expires_at: "2026-07-28T12:00:00.000Z",
      }),
    );
    expect(mocks.setAuthCookies).toHaveBeenCalledWith(tokenPair);
  });
});
