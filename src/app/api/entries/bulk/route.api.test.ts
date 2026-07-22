import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadEntryAuthorizationContexts: vi.fn(),
  canViewEntryResource: vi.fn(),
  isManagerPlusForSite: vi.fn(),
  bulkUpdateEntries: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/current-user")>()),
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/authorization", () => ({
  loadEntryAuthorizationContexts: mocks.loadEntryAuthorizationContexts,
  canViewEntryResource: mocks.canViewEntryResource,
  isManagerPlusForSite: mocks.isManagerPlusForSite,
}));
vi.mock("@/lib/entries/bulk-mutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entries/bulk-mutations")>()),
  bulkUpdateEntries: mocks.bulkUpdateEntries,
}));

import { POST } from "./route";

const entryIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
];
const viewer = {
  id: "20000000-0000-4000-8000-000000000001",
  wp_user_id: 1,
  wp_site: "pl",
  email: "manager@example.test",
  display_name: "Manager",
  avatar_url: null,
  bio: null,
  timezone: "UTC",
  theme: "dark",
  can_publish: false,
  onboarding_completed: true,
  roles: ["manager"],
  role_rows: [{ role: "manager", site: "pl" }],
  session_id: "session-manager",
} satisfies CurrentUser;

function request() {
  return new Request("http://localhost/api/entries/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "set_priority",
      priority: true,
      entry_ids: entryIds,
    }),
  });
}

describe("bulk entry authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(viewer);
    mocks.loadEntryAuthorizationContexts.mockResolvedValue(
      new Map(entryIds.map((id) => [id, { id, site: "pl" }])),
    );
    mocks.canViewEntryResource.mockReturnValue(true);
    mocks.isManagerPlusForSite.mockReturnValue(true);
    mocks.bulkUpdateEntries.mockResolvedValue({ ok: true, updated: 2 });
  });

  it("rejects an unauthenticated request", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.bulkUpdateEntries).not.toHaveBeenCalled();
  });

  it("rejects the whole operation when any resource is outside manager scope", async () => {
    mocks.isManagerPlusForSite
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.bulkUpdateEntries).not.toHaveBeenCalled();
  });

  it("rejects the whole operation when any selected entry is missing", async () => {
    mocks.loadEntryAuthorizationContexts.mockResolvedValue(
      new Map([[entryIds[0], { id: entryIds[0], site: "pl" }]]),
    );
    expect((await POST(request())).status).toBe(404);
    expect(mocks.bulkUpdateEntries).not.toHaveBeenCalled();
  });

  it("executes one transactional mutation after every selected entry passes", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      selected: 2,
      updated: 2,
    });
    expect(mocks.bulkUpdateEntries).toHaveBeenCalledOnce();
    expect(mocks.bulkUpdateEntries).toHaveBeenCalledWith(viewer.id, {
      action: "set_priority",
      priority: true,
      entry_ids: entryIds,
    });
  });
});
