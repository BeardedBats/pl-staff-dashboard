import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth/current-user";
import { writeAuditRow } from "@/lib/entries/status-transitions";
import { appendRecentActivity } from "@/lib/entries/recent-activity";
import { createWpDraftForEntry } from "@/lib/entries/wp-post";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type ClaimRole = "writer" | "editor" | "graphic";
export type ClaimStatus = "pending" | "approved" | "denied";

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
  | { ok: false; error: string }
> {
  if (roleType !== "writer") {
    return {
      ok: false,
      error:
        "Only writer claims go through /api/entries/:id/claim. Editors use claim-edit; graphics use Step 5 graphic requests.",
    };
  }

  const supabase = getSupabaseAdmin();

  // Load the entry.
  const { data: entry } = await supabase
    .from("entries")
    .select("id, content_status, wp_post_id, title, site")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { ok: false, error: "Entry not found" };

  if (entry.content_status !== "writer_needed") {
    return {
      ok: false,
      error: `Entry is not available for claiming (status: ${entry.content_status}).`,
    };
  }

  // Insert the claim row first.
  const { data: created, error: insertError } = await supabase
    .from("claims")
    .insert({
      entry_id: entryId,
      user_id: viewer.id,
      role_type: roleType,
      status: "pending",
    })
    .select("id")
    .single();
  if (insertError || !created) {
    return { ok: false, error: "Failed to create claim" };
  }

  await writeAuditRow(
    entryId,
    viewer.id,
    "claim",
    "content_track",
    null,
    `${viewer.display_name} requested to write`,
  );

  // Auto-approve path: admin+ / eic / ops / manager claiming for themselves.
  const isSelfApprover = viewer.roles.some((r) =>
    ["admin", "eic", "operations", "manager"].includes(r),
  );

  if (isSelfApprover) {
    const approvalResult = await approveClaim(
      viewer,
      created.id as string,
      { autoApproval: true },
    );
    if (!approvalResult.ok) {
      return { ok: false, error: approvalResult.error };
    }
    return { ok: true, status: "approved", claim_id: created.id as string };
  }

  // Otherwise flip the entry to `claim_requested` and leave the claim pending.
  await supabase
    .from("entries")
    .update({
      content_status: "claim_requested",
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  await writeAuditRow(
    entryId,
    viewer.id,
    "status_change",
    "content_status",
    "writer_needed",
    "claim_requested",
  );

  return { ok: true, status: "pending", claim_id: created.id as string };
}

// --------------------------------------------------------------------------
// Approve / reject claims (manager+ or auto)
// --------------------------------------------------------------------------

export async function approveClaim(
  approver: CurrentUser,
  claimId: string,
  opts: { autoApproval?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: claim } = await supabase
    .from("claims")
    .select("id, entry_id, user_id, role_type, status")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) return { ok: false, error: "Claim not found" };
  if (claim.status !== "pending") {
    return { ok: false, error: `Claim already ${claim.status}` };
  }

  // Permission check — skip in the auto-approval path (we've already vetted
  // the viewer there).
  if (!opts.autoApproval && !isManagerPlus(approver)) {
    return { ok: false, error: "Only managers can approve claims" };
  }

  // Read the entry's current content_status so the audit log captures the
  // actual transition. This matters because auto-approval skips the
  // `claim_requested` intermediate state — the entry jumps straight from
  // `writer_needed` to `claimed` — and we want the audit row to reflect that.
  const { data: priorEntry } = await supabase
    .from("entries")
    .select("content_status")
    .eq("id", claim.entry_id)
    .maybeSingle();
  const previousContentStatus = (priorEntry?.content_status as string | null) ?? "writer_needed";

  // 1. Mark the claim approved.
  await supabase
    .from("claims")
    .update({
      status: "approved",
      approved_by: approver.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  // 2. Attach the claimer as the primary author.
  await supabase.from("entry_authors").insert({
    entry_id: claim.entry_id,
    user_id: claim.user_id,
    role: "primary",
  });

  // 3. Flip the entry to claimed.
  await supabase
    .from("entries")
    .update({
      content_status: "claimed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.entry_id);

  await writeAuditRow(
    claim.entry_id,
    approver.id,
    "status_change",
    "content_status",
    previousContentStatus,
    "claimed",
  );

  await appendRecentActivity(claim.entry_id as string, {
    type: "claim",
    actor_id: approver.id,
    actor_name: approver.display_name,
    label:
      opts.autoApproval && approver.id === claim.user_id
        ? "claimed to write"
        : "claim approved — writer assigned",
    at: new Date().toISOString(),
  });

  // 4. Create the WP draft. Best-effort — if WP is down, we still mark
  //    the claim approved but flag the failure in the audit log.
  const draft = await createWpDraftForEntry(claim.entry_id, claim.user_id);
  if (!draft.ok) {
    await writeAuditRow(
      claim.entry_id,
      approver.id,
      "field_edit",
      "wp_draft_create_error",
      null,
      draft.error,
    );
  }

  return { ok: true };
}

export async function denyClaim(
  approver: CurrentUser,
  claimId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: claim } = await supabase
    .from("claims")
    .select("id, entry_id, user_id, status")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) return { ok: false, error: "Claim not found" };
  if (claim.status !== "pending") {
    return { ok: false, error: `Claim already ${claim.status}` };
  }

  if (!isManagerPlus(approver)) {
    return { ok: false, error: "Only managers can deny claims" };
  }

  await supabase
    .from("claims")
    .update({
      status: "denied",
      approved_by: approver.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  // Revert the entry back to writer_needed.
  await supabase
    .from("entries")
    .update({
      content_status: "writer_needed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.entry_id);

  await writeAuditRow(
    claim.entry_id,
    approver.id,
    "status_change",
    "content_status",
    "claim_requested",
    "writer_needed (claim denied)",
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
  }>).map((row) => ({
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
