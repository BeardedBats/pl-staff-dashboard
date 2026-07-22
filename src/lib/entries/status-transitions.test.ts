import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  appendRecentActivity: vi.fn(),
  findMissingRequiredItems: vi.fn(),
  triggerContentSubmitted: vi.fn(),
  canEditorActOnSite: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/lib/entries/recent-activity", () => ({
  appendRecentActivity: mocks.appendRecentActivity,
}));
vi.mock("@/lib/checklist/data", () => ({
  findMissingRequiredItems: mocks.findMissingRequiredItems,
}));
vi.mock("@/lib/notifications/trigger", () => ({
  triggerContentSubmitted: mocks.triggerContentSubmitted,
  triggerEntryPublished: vi.fn(),
  triggerEntryScheduled: vi.fn(),
}));
vi.mock("@/lib/auth/authorization", () => ({
  canEditorActOnSite: mocks.canEditorActOnSite,
}));

import { claimEdit, submitContent } from "./status-transitions";

const viewer: CurrentUser = {
  id: "10000000-0000-4000-8000-000000000001",
  wp_user_id: 1,
  wp_site: "pl",
  email: "staff@example.test",
  display_name: "Staff",
  avatar_url: null,
  bio: null,
  timezone: "UTC",
  theme: "dark",
  can_publish: false,
  onboarding_completed: true,
  roles: ["writer"],
  role_rows: [{ role: "writer", site: "pl" }],
  session_id: "session-staff",
};

const entryId = "40000000-0000-4000-8000-000000000001";

function singleQuery(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("transactional editorial state transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMissingRequiredItems.mockResolvedValue([]);
    mocks.canEditorActOnSite.mockReturnValue(true);
  });

  it("emits submission side effects only after the state transaction commits", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "entry_authors") return singleQuery({ id: "author-row" });
      if (table === "entries") {
        return singleQuery({
          id: entryId,
          title: "Entry",
          content_status: "claimed",
          editor_status: "none",
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(submitContent(viewer, entryId)).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("transition_editorial_entry", {
      p_actor_id: viewer.id,
      p_entry_id: entryId,
      p_action: "submit",
    });
    expect(mocks.appendRecentActivity).toHaveBeenCalledOnce();
    expect(mocks.triggerContentSubmitted).toHaveBeenCalledWith(
      viewer,
      entryId,
      "Entry",
    );
  });

  it("turns a concurrent state loss into a conflict without duplicate effects", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "entry_authors") return singleQuery({ id: "author-row" });
      if (table === "entries") {
        return singleQuery({
          id: entryId,
          content_status: "claimed",
          editor_status: "none",
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "content_not_submittable" },
    });

    await expect(submitContent(viewer, entryId)).resolves.toEqual({
      ok: false,
      error: {
        kind: "invalid_transition",
        message: "Entry changed while this request was being processed.",
      },
    });
    expect(mocks.appendRecentActivity).not.toHaveBeenCalled();
    expect(mocks.triggerContentSubmitted).not.toHaveBeenCalled();
  });

  it("reports a competing editor claim instead of pretending both succeeded", async () => {
    mocks.from.mockReturnValue(
      singleQuery({
        content_status: "submitted",
        editor_status: "ready_for_edit",
        site: "pl",
      }),
    );
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "edit_already_claimed" },
    });

    await expect(claimEdit(viewer, entryId)).resolves.toEqual({
      ok: false,
      error: {
        kind: "invalid_transition",
        message: "Entry changed while this request was being processed.",
      },
    });
  });

  it("does not claim an edit while revisions are still with the writer", async () => {
    mocks.from.mockReturnValue(
      singleQuery({
        content_status: "polishing",
        editor_status: "ready_for_edit",
        site: "pl",
      }),
    );

    await expect(claimEdit(viewer, entryId)).resolves.toEqual({
      ok: false,
      error: {
        kind: "invalid_transition",
        message: "The writer must submit an entry before an editor can claim it.",
      },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
