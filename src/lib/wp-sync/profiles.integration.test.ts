import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  fetchWpUserById: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/auth/wordpress", () => ({
  fetchWpUserById: mocks.fetchWpUserById,
}));

import { syncWpProfiles } from "./profiles";

function usersQuery(users: unknown[]) {
  const query = { select: vi.fn(), not: vi.fn() };
  query.select.mockReturnValue(query);
  query.not.mockResolvedValue({ data: users });
  return query;
}

function updateQuery() {
  const query = { update: vi.fn(), eq: vi.fn() };
  query.update.mockReturnValue(query);
  query.eq.mockResolvedValue({ error: null });
  return query;
}

describe("scheduled WordPress profile reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back from PL to QB for a both-site user and preserves a local name", async () => {
    const local = {
      id: "user-1",
      wp_user_id: 42,
      wp_site: "both",
      display_name: "Chosen Name",
      display_name_override: true,
      bio: "Old bio",
      avatar_url: null,
    };
    const update = updateQuery();
    mocks.from
      .mockReturnValueOnce(usersQuery([local]))
      .mockReturnValueOnce(update);
    mocks.fetchWpUserById
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: "network", message: "PL unavailable" },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          name: "Remote Name",
          description: "New bio",
          avatar_url: "https://example.test/avatar.png",
        },
      });

    const report = await syncWpProfiles();

    expect(mocks.fetchWpUserById).toHaveBeenNthCalledWith(1, "pl", 42);
    expect(mocks.fetchWpUserById).toHaveBeenNthCalledWith(2, "qb", 42);
    expect(update.update).toHaveBeenCalledWith({
      bio: "New bio",
      avatar_url: "https://example.test/avatar.png",
      last_wp_sync: expect.any(String),
    });
    expect(update.eq).toHaveBeenCalledWith("id", "user-1");
    expect(report).toMatchObject({
      usersChecked: 1,
      usersUpdated: 1,
      unchanged: 0,
      notFound: 0,
      errors: [],
    });
  });

  it("classifies a user missing from both sites without writing", async () => {
    mocks.from.mockReturnValueOnce(
      usersQuery([
        {
          id: "user-1",
          wp_user_id: 42,
          wp_site: "both",
          display_name: "Name",
          display_name_override: false,
          bio: null,
          avatar_url: null,
        },
      ]),
    );
    mocks.fetchWpUserById.mockResolvedValue({
      ok: false,
      error: { kind: "not_found", message: "missing" },
    });

    const report = await syncWpProfiles();

    expect(mocks.fetchWpUserById).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({
      usersChecked: 1,
      usersUpdated: 0,
      notFound: 1,
      errors: [],
    });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});
