import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadEntryAuthorizationContexts: vi.fn(),
  canViewEntryResource: vi.fn(),
  canEditorActOnSite: vi.fn(),
  bulkClaimEditorEntries: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/current-user")>()),
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/authorization", () => ({
  loadEntryAuthorizationContexts: mocks.loadEntryAuthorizationContexts,
  canViewEntryResource: mocks.canViewEntryResource,
  canEditorActOnSite: mocks.canEditorActOnSite,
}));
vi.mock("@/lib/entries/bulk-editor-claims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entries/bulk-editor-claims")>()),
  bulkClaimEditorEntries: mocks.bulkClaimEditorEntries,
}));

import { POST } from "./route";

const ids = [
  "23000000-0000-4000-8000-000000000011",
  "23000000-0000-4000-8000-000000000012",
];
const viewer = {
  id: "23000000-0000-4000-8000-000000000001",
  wp_user_id: 23,
  wp_site: "pl",
  email: "editor@example.test",
  display_name: "Editor",
  avatar_url: null,
  bio: null,
  timezone: "UTC",
  theme: "dark",
  can_publish: false,
  onboarding_completed: true,
  roles: ["editor"],
  role_rows: [{ role: "editor", site: "pl" }],
  session_id: "session-editor",
} satisfies CurrentUser;

function request() {
  return new Request("http://localhost/api/entries/bulk-claim-edits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry_ids: ids }),
  });
}

describe("bulk editor claim boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(viewer);
    mocks.loadEntryAuthorizationContexts.mockResolvedValue(
      new Map(ids.map((id) => [id, { id, site: "pl" }])),
    );
    mocks.canViewEntryResource.mockReturnValue(true);
    mocks.canEditorActOnSite.mockReturnValue(true);
    mocks.bulkClaimEditorEntries.mockResolvedValue({ ok: true, claimed: 2 });
  });

  it("requires a current session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
  });

  it("rejects the whole batch when one site is outside editor authority", async () => {
    mocks.canEditorActOnSite.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.bulkClaimEditorEntries).not.toHaveBeenCalled();
  });

  it("maps an atomic claim race to conflict", async () => {
    mocks.bulkClaimEditorEntries.mockResolvedValue({ ok: false, kind: "conflict" });
    expect((await POST(request())).status).toBe(409);
  });

  it("claims the exact authorized batch once", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, claimed: 2 });
    expect(mocks.bulkClaimEditorEntries).toHaveBeenCalledWith(viewer.id, ids);
  });
});
