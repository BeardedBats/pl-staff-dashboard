import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadAuthorization: vi.fn(),
  isManager: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/authorization", () => ({
  loadEntryAuthorizationContext: mocks.loadAuthorization,
  isManagerPlusForSite: mocks.isManager,
}));
vi.mock("@/lib/entries/wp-post", () => ({ resolveWpTitleConflict: mocks.resolve }));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "entry-1" }) };
function request(body: unknown) {
  return new Request("http://localhost/api/entries/entry-1/wp-conflict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("WordPress conflict resolution API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "manager" });
    mocks.loadAuthorization.mockResolvedValue({ id: "entry-1", site: "pl" });
    mocks.isManager.mockReturnValue(true);
    mocks.resolve.mockResolvedValue({
      ok: true,
      before: "Old",
      after: "Chosen",
      wpModifiedAt: "2026-07-22T00:00:00.000Z",
    });
  });

  it("hides the resource from a non-manager", async () => {
    mocks.isManager.mockReturnValue(false);
    const response = await POST(
      request({
        resolution: "wordpress",
        expected_wp_modified_at: "2026-07-22T00:00:00.000Z",
        confirm: true,
      }),
      context,
    );
    expect(response.status).toBe(404);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation", async () => {
    const response = await POST(
      request({
        resolution: "dashboard",
        expected_wp_modified_at: "2026-07-22T00:00:00.000Z",
        confirm: false,
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("returns a conflict when WordPress changed after comparison", async () => {
    mocks.resolve.mockResolvedValue({
      ok: false,
      error: "WordPress changed again. Refresh before resolving.",
      conflict: true,
    });
    const response = await POST(
      request({
        resolution: "dashboard",
        expected_wp_modified_at: "2026-07-22T00:00:00.000Z",
        confirm: true,
      }),
      context,
    );
    expect(response.status).toBe(409);
  });

  it("passes the confirmed before/after choice to the guarded resolver", async () => {
    const response = await POST(
      request({
        resolution: "wordpress",
        expected_wp_modified_at: "2026-07-22T00:00:00.000Z",
        confirm: true,
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith("entry-1", "manager", {
      resolution: "wordpress",
      expectedWpModifiedAt: "2026-07-22T00:00:00.000Z",
    });
  });
});
