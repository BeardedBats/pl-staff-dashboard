import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/wordpress/config", () => ({
  getWordPressSiteConfig: () => ({
    url: "https://wordpress.test",
    appUsername: "integration",
    appPassword: "secret",
  }),
  wordPressBasicAuth: () => "Basic redacted",
}));
vi.mock("@/lib/entries/status-transitions", () => ({
  applyWpStateToEntry: vi.fn(),
  writeAuditRow: vi.fn(),
}));

import { refreshWpStatusForEntry } from "./wp-post";

describe("manual WordPress refresh recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("records a bounded visible error when WordPress cannot be reached", async () => {
    const selectQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "entry-1", site: "pl", wp_post_id: 42, wp_status: "draft" },
      }),
    };
    selectQuery.select.mockReturnValue(selectQuery);
    selectQuery.eq.mockReturnValue(selectQuery);
    const updateQuery = { update: vi.fn(), eq: vi.fn().mockResolvedValue({ error: null }) };
    updateQuery.update.mockReturnValue(updateQuery);
    let call = 0;
    mocks.from.mockImplementation(() => (call++ === 0 ? selectQuery : updateQuery));
    mocks.fetch.mockRejectedValue(new Error("private upstream detail"));

    const result = await refreshWpStatusForEntry("entry-1", "viewer-1");

    expect(result).toEqual({ ok: false, error: "Could not reach WordPress. Try again in a moment." });
    expect(updateQuery.update).toHaveBeenCalledWith({
      wp_sync_status: "error",
      wp_last_sync_error: "Could not reach WordPress. Try again in a moment.",
    });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "entry-1");
  });
});
