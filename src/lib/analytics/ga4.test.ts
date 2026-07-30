import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  deleteRows: vi.fn(),
  inKeys: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    GA4_CLIENT_ID: "client-id",
    GA4_CLIENT_SECRET: "client-secret",
    GA4_PROPERTY_ID: "property-id",
    NEXT_PUBLIC_APP_URL: "https://dashboard.example.com",
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

import { disconnectGa4 } from "./ga4";

describe("disconnectGa4", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ delete: mocks.deleteRows });
    mocks.deleteRows.mockReturnValue({ in: mocks.inKeys });
    mocks.inKeys.mockResolvedValue({ error: null });
  });

  it("deletes every stored OAuth credential", async () => {
    await disconnectGa4();

    expect(mocks.from).toHaveBeenCalledWith("global_settings");
    expect(mocks.inKeys).toHaveBeenCalledWith("key", [
      "ga4_refresh_token",
      "ga4_access_token",
      "ga4_access_expires",
    ]);
  });

  it("does not silently report success when deletion fails", async () => {
    const error = new Error("database unavailable");
    mocks.inKeys.mockResolvedValue({ error });

    await expect(disconnectGa4()).rejects.toBe(error);
  });
});
