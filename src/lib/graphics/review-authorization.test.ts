import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  loadAuthorization: vi.fn(),
  canSubmit: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}));
vi.mock("@/lib/auth/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/authorization")>()),
  loadEntryAuthorizationContext: mocks.loadAuthorization,
  canUploadOrSubmitGraphicResource: mocks.canSubmit,
}));
vi.mock("@/lib/entries/status-transitions", () => ({ writeAuditRow: vi.fn() }));
vi.mock("@/lib/notifications/trigger", () => ({
  triggerGraphicFlagged: vi.fn(),
  triggerGraphicRequested: vi.fn(),
}));
vi.mock("@/lib/graphics/storage", () => ({
  getSignedGraphicUrl: vi.fn(),
  getSignedGraphicUrls: vi.fn(),
}));

import { submitGraphicForReview } from "./data";

const viewer = { id: "artist-1" } as CurrentUser;

describe("graphic review submission authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({
      data: { entry_id: "entry-1", claimed_by: "artist-1" },
    });
    mocks.loadAuthorization.mockResolvedValue({ id: "entry-1", site: "pl" });
  });

  it("rejects an unassigned actor before the transition RPC", async () => {
    mocks.canSubmit.mockReturnValue(false);

    const result = await submitGraphicForReview(viewer, "request-1");

    expect(result).toEqual({
      ok: false,
      kind: "forbidden",
      error: "Only the assigned graphics worker can submit for review",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the locked server transition for an assigned worker", async () => {
    mocks.canSubmit.mockReturnValue(true);
    mocks.rpc.mockResolvedValue({ error: null });

    const result = await submitGraphicForReview(viewer, "request-1");

    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("submit_graphic_for_review", {
      p_actor_id: "artist-1",
      p_request_id: "request-1",
    });
  });
});
