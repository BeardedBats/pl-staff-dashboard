import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type ChecklistItemRecord = {
  id: string;
  tier_id: string;
  tier_name: string;
  label: string;
  sort_order: number;
  is_required: boolean;
  created_at: string;
};

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

export const createChecklistItemSchema = z.object({
  tier_id: z.uuid(),
  label: z.string().trim().min(1).max(200),
  sort_order: z.number().int().min(0).max(999).optional().default(0),
  is_required: z.boolean().optional().default(true),
});

export const updateChecklistItemSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
  is_required: z.boolean().optional(),
});

// --------------------------------------------------------------------------
// Queries
// --------------------------------------------------------------------------

/** List all checklist items across all tiers, joined with tier names. */
export async function listChecklistItems(): Promise<ChecklistItemRecord[]> {
  const { data } = await getSupabaseAdmin()
    .from("checklist_items")
    .select(
      "id, tier_id, label, sort_order, is_required, created_at, tiers!inner(name)",
    )
    .order("sort_order", { ascending: true });

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    tier_id: string;
    label: string;
    sort_order: number;
    is_required: boolean;
    created_at: string;
    tiers: { name: string };
  }>;

  return rows.map((r) => ({
    id: r.id,
    tier_id: r.tier_id,
    tier_name: r.tiers.name,
    label: r.label,
    sort_order: r.sort_order,
    is_required: Boolean(r.is_required),
    created_at: r.created_at,
  }));
}

// --------------------------------------------------------------------------
// Item CRUD (admin)
// --------------------------------------------------------------------------

export async function createChecklistItem(
  input: z.infer<typeof createChecklistItemSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("checklist_items")
    .insert({
      tier_id: input.tier_id,
      label: input.label,
      sort_order: input.sort_order ?? 0,
      is_required: input.is_required ?? true,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Create failed" };
  return { ok: true, id: data.id as string };
}

export async function updateChecklistItem(
  id: string,
  input: z.infer<typeof updateChecklistItemSchema>,
): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("checklist_items")
    .update(input)
    .eq("id", id);
  return !error;
}

export async function deleteChecklistItem(id: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("checklist_items")
    .delete()
    .eq("id", id);
  return !error;
}

// --------------------------------------------------------------------------
// Per-entry checkbox toggles
// --------------------------------------------------------------------------

/**
 * Toggle a checklist item on a specific entry. Returns the entry's updated
 * checklist snapshot so the UI can re-render.
 *
 * Permission check (caller responsibility): primary author, editor on the
 * entry, or admin+.
 */
export async function setChecklistItemCompleted(
  entryId: string,
  itemId: string,
  userId: string,
  completed: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("entry_checklist")
    .select("id")
    .eq("entry_id", entryId)
    .eq("checklist_item_id", itemId)
    .maybeSingle();

  if (!existing) {
    // Row doesn't exist yet — create it in the target state.
    const { error } = await supabase.from("entry_checklist").insert({
      entry_id: entryId,
      checklist_item_id: itemId,
      is_completed: completed,
      completed_by: completed ? userId : null,
      completed_at: completed ? new Date().toISOString() : null,
    });
    if (error) return { ok: false, error: "Insert failed" };
    return { ok: true };
  }

  const { error } = await supabase
    .from("entry_checklist")
    .update({
      is_completed: completed,
      completed_by: completed ? userId : null,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", existing.id as string);

  if (error) return { ok: false, error: "Update failed" };
  return { ok: true };
}

// --------------------------------------------------------------------------
// Submit gate helper
// --------------------------------------------------------------------------

/**
 * Given an entry ID, check whether all required checklist items are
 * complete. Returns the list of missing required item labels (empty if OK).
 *
 * Used by submitContent to block the submission until the writer has
 * ticked every required checkbox.
 */
export async function findMissingRequiredItems(
  entryId: string,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("entry_checklist")
    .select(
      "is_completed, checklist_items!inner(label, is_required)",
    )
    .eq("entry_id", entryId);

  const rows = (data ?? []) as unknown as Array<{
    is_completed: boolean;
    checklist_items: { label: string; is_required: boolean };
  }>;

  return rows
    .filter((r) => r.checklist_items.is_required && !r.is_completed)
    .map((r) => r.checklist_items.label);
}

// --------------------------------------------------------------------------
// Permission helper
// --------------------------------------------------------------------------

/**
 * Check whether a user can toggle checklist items on a given entry.
 * Allowed: primary author(s), entry editors, admin+ / eic / operations.
 */
export async function canUserEditChecklist(
  entryId: string,
  userId: string,
  userRoles: string[],
): Promise<boolean> {
  if (
    userRoles.some((r) =>
      ["admin", "eic", "operations"].includes(r),
    )
  ) {
    return true;
  }

  const supabase = getSupabaseAdmin();

  const { data: authorRow } = await supabase
    .from("entry_authors")
    .select("id")
    .eq("entry_id", entryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (authorRow) return true;

  const { data: editorRow } = await supabase
    .from("entry_editors")
    .select("id")
    .eq("entry_id", entryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (editorRow) return true;

  return false;
}
