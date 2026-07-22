import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  loadAuthorization: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/auth/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/authorization")>()),
  loadEntryAuthorizationContext: mocks.loadAuthorization,
}));
vi.mock("./storage", () => ({
  getSignedGraphicUrl: vi.fn(),
  getSignedGraphicUrls: mocks.sign,
}));

import { listGraphicRequestVersions } from "./data";

const viewer: CurrentUser = {
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

function requestQuery() {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { entry_id: "entry-1" } }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe("graphic version history authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockImplementation((table: string) => {
      if (table !== "graphic_requests") {
        throw new Error("version rows were queried before authorization");
      }
      return requestQuery();
    });
    mocks.loadAuthorization.mockResolvedValue({
      id: "entry-1",
      site: "pl",
      createdBy: "creator",
      isDrafted: false,
      authorIds: new Set(["author"]),
      editorIds: new Set(["editor"]),
    });
  });

  it("returns no history and signs nothing for a same-site outsider", async () => {
    await expect(
      listGraphicRequestVersions(viewer, "request-1"),
    ).resolves.toBeNull();

    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
