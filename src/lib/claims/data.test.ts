import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  appendRecentActivity: vi.fn(),
  triggerClaimRequested: vi.fn(),
  triggerClaimResolved: vi.fn(),
  createWpDraftForEntry: vi.fn(),
  canClaimWriterResource: vi.fn(),
  isManagerPlusForSite: vi.fn(),
  loadEntryAuthorizationContext: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/lib/entries/recent-activity", () => ({
  appendRecentActivity: mocks.appendRecentActivity,
}));
vi.mock("@/lib/notifications/trigger", () => ({
  triggerClaimRequested: mocks.triggerClaimRequested,
  triggerClaimResolved: mocks.triggerClaimResolved,
}));
vi.mock("@/lib/entries/wp-post", () => ({
  createWpDraftForEntry: mocks.createWpDraftForEntry,
}));
vi.mock("@/lib/auth/authorization", () => ({
  canClaimWriterResource: mocks.canClaimWriterResource,
  isManagerPlusForSite: mocks.isManagerPlusForSite,
  loadEntryAuthorizationContext: mocks.loadEntryAuthorizationContext,
}));

import { approveClaim, createClaim, denyClaim } from "./data";

const writer: CurrentUser = {
  id: "10000000-0000-4000-8000-000000000001",
  wp_user_id: 1,
  wp_site: "pl",
  email: "writer@example.test",
  display_name: "Writer",
  avatar_url: null,
  bio: null,
  timezone: "UTC",
  theme: "dark",
  can_publish: false,
  onboarding_completed: true,
  roles: ["writer"],
  role_rows: [{ role: "writer", site: "pl" }],
  session_id: "session-writer",
};

const manager: CurrentUser = {
  ...writer,
  id: "10000000-0000-4000-8000-000000000002",
  email: "manager@example.test",
  display_name: "Manager",
  roles: ["manager"],
  role_rows: [{ role: "manager", site: "pl" }],
  session_id: "session-manager",
};

const entryId = "40000000-0000-4000-8000-000000000001";
const claimId = "50000000-0000-4000-8000-000000000001";

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

function rpcResult(data: unknown, error: unknown = null) {
  return {
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

describe("transactional writer claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadEntryAuthorizationContext.mockResolvedValue({
      id: entryId,
      site: "pl",
    });
    mocks.canClaimWriterResource.mockReturnValue(true);
    mocks.isManagerPlusForSite.mockImplementation(
      (candidate: CurrentUser) => candidate.id === manager.id,
    );
    mocks.createWpDraftForEntry.mockResolvedValue({ ok: true });
  });

  it("notifies managers only after a pending claim transaction commits", async () => {
    mocks.from.mockReturnValue(singleQuery({ id: entryId, title: "Entry" }));
    mocks.rpc.mockReturnValue(
      rpcResult({ claim_id: claimId, claim_status: "pending" }),
    );

    await expect(createClaim(writer, entryId, "writer")).resolves.toEqual({
      ok: true,
      status: "pending",
      claim_id: claimId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("create_writer_claim", {
      p_actor_id: writer.id,
      p_entry_id: entryId,
      p_auto_approve: false,
    });
    expect(mocks.triggerClaimRequested).toHaveBeenCalledOnce();
    expect(mocks.createWpDraftForEntry).not.toHaveBeenCalled();
  });

  it("does not emit side effects when a competing claim wins first", async () => {
    mocks.from.mockReturnValue(singleQuery({ id: entryId, title: "Entry" }));
    mocks.rpc.mockReturnValue(
      rpcResult(null, { code: "P0001", message: "entry_not_claimable" }),
    );

    await expect(createClaim(writer, entryId, "writer")).resolves.toEqual({
      ok: false,
      kind: "conflict",
      error: "Entry is not available for claiming",
    });
    expect(mocks.triggerClaimRequested).not.toHaveBeenCalled();
    expect(mocks.appendRecentActivity).not.toHaveBeenCalled();
  });

  it("auto-approves only when manager authority covers the entry site", async () => {
    mocks.from.mockReturnValue(singleQuery({ id: entryId, title: "Entry" }));
    mocks.rpc.mockReturnValue(
      rpcResult({ claim_id: claimId, claim_status: "approved" }),
    );

    await expect(createClaim(manager, entryId, "writer")).resolves.toEqual({
      ok: true,
      status: "approved",
      claim_id: claimId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("create_writer_claim", {
      p_actor_id: manager.id,
      p_entry_id: entryId,
      p_auto_approve: true,
    });
    expect(mocks.createWpDraftForEntry).toHaveBeenCalledWith(entryId, manager.id);
  });

  it("runs assignment side effects only after approval commits", async () => {
    mocks.from.mockReturnValue(
      singleQuery({
        id: claimId,
        entry_id: entryId,
        user_id: writer.id,
        role_type: "writer",
        status: "pending",
      }),
    );
    mocks.rpc.mockReturnValue(
      rpcResult({
        resolved_entry_id: entryId,
        claimant_user_id: writer.id,
        entry_title: "Entry",
        resolution: "approve",
      }),
    );

    await expect(approveClaim(manager, claimId)).resolves.toEqual({ ok: true });
    expect(mocks.createWpDraftForEntry).toHaveBeenCalledWith(entryId, writer.id);
    expect(mocks.triggerClaimResolved).toHaveBeenCalledWith(
      manager,
      writer.id,
      entryId,
      "Entry",
      true,
    );
  });

  it("suppresses approval side effects when claim resolution loses a race", async () => {
    mocks.from.mockReturnValue(
      singleQuery({
        id: claimId,
        entry_id: entryId,
        user_id: writer.id,
        role_type: "writer",
        status: "pending",
      }),
    );
    mocks.rpc.mockReturnValue(
      rpcResult(null, { code: "P0001", message: "claim_not_pending" }),
    );

    await expect(approveClaim(manager, claimId)).resolves.toEqual({
      ok: false,
      kind: "conflict",
      error: "Claim is no longer pending",
    });
    expect(mocks.createWpDraftForEntry).not.toHaveBeenCalled();
    expect(mocks.triggerClaimResolved).not.toHaveBeenCalled();
  });

  it("denies transactionally without creating WordPress assignment work", async () => {
    mocks.from.mockReturnValue(
      singleQuery({
        id: claimId,
        entry_id: entryId,
        user_id: writer.id,
        status: "pending",
      }),
    );
    mocks.rpc.mockReturnValue(
      rpcResult({
        resolved_entry_id: entryId,
        claimant_user_id: writer.id,
        entry_title: "Entry",
        resolution: "deny",
      }),
    );

    await expect(denyClaim(manager, claimId)).resolves.toEqual({ ok: true });
    expect(mocks.createWpDraftForEntry).not.toHaveBeenCalled();
    expect(mocks.triggerClaimResolved).toHaveBeenCalledWith(
      manager,
      writer.id,
      entryId,
      "Entry",
      false,
    );
  });
});
