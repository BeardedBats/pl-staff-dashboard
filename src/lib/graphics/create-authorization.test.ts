import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  loadEntryAuthorizationContext: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/auth/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/authorization")>()),
  loadEntryAuthorizationContext: mocks.loadEntryAuthorizationContext,
}));
vi.mock("@/lib/entries/status-transitions", () => ({
  writeAuditRow: vi.fn(),
}));
vi.mock("@/lib/notifications/trigger", () => ({
  triggerGraphicFlagged: vi.fn(),
  triggerGraphicRequested: vi.fn(),
}));
vi.mock("@/lib/graphics/storage", () => ({
  getSignedGraphicUrl: vi.fn(),
  getSignedGraphicUrls: vi.fn(),
}));

import { createGraphicRequest } from "./data";

function viewer(): CurrentUser {
  return {
    id: "outsider",
    wp_user_id: 1,
    wp_site: "pl",
    email: "outsider@example.test",
    display_name: "Outsider",
    avatar_url: null,
    bio: null,
    timezone: "UTC",
    theme: "dark",
    can_publish: false,
    onboarding_completed: true,
    roles: ["writer"],
    role_rows: [{ role: "writer", site: "pl" }],
    session_id: "session-outsider",
  };
}

describe("graphic request creation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadEntryAuthorizationContext.mockResolvedValue({
      id: "entry-pl",
      site: "pl",
      createdBy: "creator",
      isDrafted: false,
      authorIds: new Set(["author"]),
      editorIds: new Set(["editor"]),
    });
  });

  it("rejects a same-site outsider before any database write", async () => {
    const result = await createGraphicRequest(viewer(), "entry-pl", {
      title: "Unauthorized request",
      requirements: {
        asset_type: "featured",
        placement: "Featured image",
        width: 1200,
        height: 675,
        format: "webp",
        alt_text: "A descriptive test image",
      },
    });

    expect(result).toEqual({
      ok: false,
      error: "You are not assigned to this entry",
    });
    expect(mocks.loadEntryAuthorizationContext).toHaveBeenCalledWith("entry-pl");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
