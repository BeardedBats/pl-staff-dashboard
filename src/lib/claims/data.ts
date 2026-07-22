import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth/current-user";
import { appendRecentActivity } from "@/lib/entries/recent-activity";
import { writeAuditRow } from "@/lib/entries/status-transitions";
import {
  triggerClaimRequested,
  triggerClaimResolved,
} from "@/lib/notifications/trigger";
import { createWpDraftForEntry } from "@/lib/entries/wp-post";
import {
  canClaimWriterResource,
  isManagerPlusForSite,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type ClaimRole = "writer" | "editor" | "graphic";
export type ClaimStatus = "pending" | "approved" | "denied";
export type ClaimFailure = {
  ok: false;
  kind: "invalid" | "not_found" | "forbidden" | "conflict" | "database";
  error: string;
};

export type ClaimRecord = {
  id: string;
  entry_id: string;
  user_id: string;
  role_type: ClaimRole;
  status: ClaimStatus;
  approved_by: string | null;
  created_at: string;
  resolved_at: string | null;
  // Joined
  entry_title: string;
  entry_site: "pl" | "qb";
  claimer_name: string;
  claimer_avatar: string | null;
};

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

export const claimRequestSchema = z.object({
  role_type: z.enum(["writer", "editor", "graphic"]),
});

// --------------------------------------------------------------------------
// Create a claim (by the user wanting to claim)
// --------------------------------------------------------------------------

/**
 * File a claim request.
 *
 * Behavior:
 *  - Writer claim on writer_needed entry:
 *      • If the claimer is Manager+ / Admin+, the claim is auto-approved
 *        and the entry jumps straight to `claimed` + WP draft creation.
 *      • Otherwise the claim goes `pending` and the entry flips to
 *        `claim_requested`. A team manager resolves it in /home inbox.
 *  - Editor claim: handled via claimEdit in status-transitions.ts, not
 *    through the claims table. This endpoint rejects role_type='editor'.
 *  - Graphic claim: handled in Step 5 (graphic requests). Rejected here.
 */
export async function createClaim(
  viewer: CurrentUser,
  entryId: string,
  roleType: ClaimRole,
): Promise<
  | { ok: true; status: "pending" | "approved"; claim_id: string }
  | ClaimFailure
> {
  if (roleType !== "writer") {
    return {
      ok: false,
      kind: "invalid",
      error:
        "Only writer claims go through /api/entries/:id/claim. Editors use claim-edit; graphics use Step 5 graphic requests.",
    };
  }

  const authorization = await loadEntryAuthorizationContext(entryId);
  if (!authorization) {
    return { ok: false, kind: "not_found", error: "Entry not found" };
  }
  if (!canClaimWriterResource(viewer, authorization)) {
    return {
      ok: false,
      kind: "forbidden",
      error: "A writer role for this site is required to claim this entry",
    };
  }

  const supabase = getSupabaseAdmin();

  // Load display data before the transactional claim RPC. The RPC repeats the
  // state check while holding the entry row lock.
  const { data: entry } = await supabase
    .from("entries")
    .select("id, title")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) {
    return { ok: false, kind: "not_found", error: "Entry not found" };
  }

  const autoApprove = isManagerPlusForSite(viewer, authorization.site);
  const { data: created, error: createError } = await supabase
    .rpc("create_writer_claim", {
      p_actor_id: viewer.id,
      p_entry_id: entryId,
      p_auto_approve: autoApprove,
    })
    .single();
  if (createError || !created) {
    if (createError?.code === "P0002") {
      return { ok: false, kind: "not_found", error: "Entry not found" };
    }
    if (createError?.code === "P0001") {
      return {
        ok: false,
        kind: "conflict",
        error: "Entry is not available for claiming",
      };
    }
    return { ok: false, kind: "database", error: "Failed to create claim" };
  }

  if (created.claim_status === "approved") {
    await appendRecentActivity(entryId, {
      type: "claim",
      actor_id: viewer.id,
      actor_name: viewer.display_name,
      label: "claimed to write",
      at: new Date().toISOString(),
    });
    const draft = await createWpDraftForEntry(entryId, viewer.id);
    if (!draft.ok) {
      await writeAuditRow(
        entryId,
        viewer.id,
        "field_edit",
        "wp_draft_create_error",
        null,
        draft.error,
      );
    }
    return {
      ok: true,
      status: "approved",
      claim_id: created.claim_id,
    };
  }

  // Notify team managers that there's a new claim to resolve.
  await triggerClaimRequested(viewer, entryId, entry.title as string);

  return { ok: true, status: "pending", claim_id: created.claim_id };
}

// --------------------------------------------------------------------------
// Approve / reject claims (manager+ or auto)
// --------------------------------------------------------------------------

export async function approveClaim(
  approver: CurrentUser,
  claimId: string,
): Promise<{ ok: true } | ClaimFailure> {
  const supabase = getSupabaseAdmin();

  const { data: claim } = await supabase
    .from("claims")
    .select("id, entry_id, user_id, role_type, status")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) {
    return { ok: false, kind: "not_found", error: "Claim not found" };
  }
  const authorization = await loadEntryAuthorizationContext(
    claim.entry_id as string,
  );
  if (!authorization) {
    return { ok: false, kind: "not_found", error: "Entry not found" };
  }

  if (!isManagerPlusForSite(approver, authorization.site)) {
    return {
      ok: false,
      kind: "forbidden",
      error: "Only managers can approve claims",
    };
  }

  const { data: resolved, error } = await supabase
    .rpc("resolve_writer_claim", {
      p_actor_id: approver.id,
      p_claim_id: claimId,
      p_action: "approve",
    })
    .single();
  if (error || !resolved) return claimResolutionFailure(error?.code);

  await appendRecentActivity(resolved.resolved_entry_id, {
    type: "claim",
    actor_id: approver.id,
    actor_name: approver.display_name,
    label: "claim approved — writer assigned",
    at: new Date().toISOString(),
  });

  // Create the WP draft. Best-effort — if WP is down, we still mark
  //    the claim approved but flag the failure in the audit log.
  const draft = await createWpDraftForEntry(
    resolved.resolved_entry_id,
    resolved.claimant_user_id,
  );
  if (!draft.ok) {
    await writeAuditRow(
      resolved.resolved_entry_id,
      approver.id,
      "field_edit",
      "wp_draft_create_error",
      null,
      draft.error,
    );
  }

  await triggerClaimResolved(
    approver,
    resolved.claimant_user_id,
    resolved.resolved_entry_id,
    resolved.entry_title,
    true,
  );

  return { ok: true };
}

export async function denyClaim(
  approver: CurrentUser,
  claimId: string,
): Promise<{ ok: true } | ClaimFailure> {
  const supabase = getSupabaseAdmin();

  const { data: claim } = await supabase
    .from("claims")
    .select("id, entry_id, user_id, status")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) {
    return { ok: false, kind: "not_found", error: "Claim not found" };
  }
  const authorization = await loadEntryAuthorizationContext(
    claim.entry_id as string,
  );
  if (!authorization) {
    return { ok: false, kind: "not_found", error: "Entry not found" };
  }

  if (!isManagerPlusForSite(approver, authorization.site)) {
    return {
      ok: false,
      kind: "forbidden",
      error: "Only managers can deny claims",
    };
  }

  const { data: resolved, error } = await supabase
    .rpc("resolve_writer_claim", {
      p_actor_id: approver.id,
      p_claim_id: claimId,
      p_action: "deny",
    })
    .single();
  if (error || !resolved) return claimResolutionFailure(error?.code);

  // Notify the claimer their claim was denied.
  await triggerClaimResolved(
    approver,
    resolved.claimant_user_id,
    resolved.resolved_entry_id,
    resolved.entry_title,
    false,
  );

  return { ok: true };
}

// --------------------------------------------------------------------------
// List pending claims
// --------------------------------------------------------------------------

/**
 * List pending claims relevant to the viewer.
 *
 * For now: admin+ / eic / operations see ALL pending; managers see pending
 * claims for entries in their managed teams (resolved via entry.category →
 * team relationship, which doesn't exist yet — so for the MVP, managers see
 * all pending claims just like admin+). Refined in Step 9 when the recurring
 * template / team routing lands.
 */
export async function listPendingClaims(
  viewer: CurrentUser,
): Promise<ClaimRecord[]> {
  if (!isManagerPlus(viewer)) return [];
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("claims")
    .select(
      "id, entry_id, user_id, role_type, status, approved_by, created_at, resolved_at, " +
        "entries!inner(title, site), " +
        "users!claims_user_id_fkey(display_name, avatar_url)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Array<{
    id: string;
    entry_id: string;
    user_id: string;
    role_type: ClaimRole;
    status: ClaimStatus;
    approved_by: string | null;
    created_at: string;
    resolved_at: string | null;
    entries: { title: string; site: "pl" | "qb" };
    users?: { display_name: string; avatar_url: string | null } | null;
  }>)
    .filter((row) => isManagerPlusForSite(viewer, row.entries.site))
    .map((row) => ({
    id: row.id,
    entry_id: row.entry_id,
    user_id: row.user_id,
    role_type: row.role_type,
    status: row.status,
    approved_by: row.approved_by,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    entry_title: row.entries.title,
    entry_site: row.entries.site,
    claimer_name: row.users?.display_name ?? "Unknown",
    claimer_avatar: row.users?.avatar_url ?? null,
    }));
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function isManagerPlus(viewer: CurrentUser): boolean {
  return viewer.roles.some((r) =>
    ["manager", "admin", "eic", "operations"].includes(r),
  );
}

function claimResolutionFailure(
  code: string | undefined,
): ClaimFailure {
  if (code === "P0002") {
    return { ok: false, kind: "not_found", error: "Claim not found" };
  }
  if (code === "P0001") {
    return {
      ok: false,
      kind: "conflict",
      error: "Claim is no longer pending",
    };
  }
  return { ok: false, kind: "database", error: "Failed to resolve claim" };
}
