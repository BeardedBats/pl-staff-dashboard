import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAdminPlusForScope: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/authorization", () => ({
  isAdminPlusForScope: mocks.isAdminPlusForScope,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/entries/queries", () => ({
  listTiers: vi.fn(),
}));

import { PATCH } from "./route";

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";

describe("PATCH /api/tiers atomic reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin" });
    mocks.isAdminPlusForScope.mockReturnValue(true);
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("delegates one complete swap to the database RPC", async () => {
    const response = await PATCH(
      new Request("https://dashboard.example.com/api/tiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swap_sort_order",
          first_id: firstId,
          second_id: secondId,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("swap_tier_sort_orders", {
      p_first_id: firstId,
      p_second_id: secondId,
    });
  });

  it("fails closed when either tier disappeared", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await PATCH(
      new Request("https://dashboard.example.com/api/tiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swap_sort_order",
          first_id: firstId,
          second_id: secondId,
        }),
      }),
    );

    expect(response.status).toBe(404);
  });
});
