import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}));

import { updateEntry } from "./mutations";

const actorId = "10000000-0000-4000-8000-000000000001";
const entryId = "40000000-0000-4000-8000-000000000001";

describe("transactional entry field updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a coherent deadline pair through the transactional RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const deadline = {
      publish_date: "2026-08-03T12:00:00Z",
      publish_date_precision: "loose_time" as const,
    };

    await expect(updateEntry(actorId, entryId, deadline)).resolves.toEqual({
      ok: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("update_entry_fields", {
      p_actor_id: actorId,
      p_entry_id: entryId,
      p_payload: deadline,
    });
  });

  it("does not report success when the field transaction fails", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "deadline mismatch" },
    });

    await expect(
      updateEntry(actorId, entryId, { priority: true }),
    ).resolves.toEqual({ ok: false, kind: "database" });
  });

  it("reports completed-checklist tier conflicts without a false 500", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "completed_checklist_blocks_tier_change",
      },
    });

    await expect(
      updateEntry(actorId, entryId, {
        tier_id: "20000000-0000-4000-8000-000000000002",
      }),
    ).resolves.toEqual({ ok: false, kind: "completed_checklist" });
  });
});
