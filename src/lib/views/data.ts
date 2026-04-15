import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type SavedViewRecord = {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, unknown>;
  sort: Record<string, unknown>;
  columns: string[];
  grouping: string | null;
  is_default: boolean;
  created_at: string;
};

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

export const createViewSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  sort: z.record(z.string(), z.unknown()).optional().default({}),
  columns: z.array(z.string()).optional().default([]),
  grouping: z.string().nullable().optional(),
  is_default: z.boolean().optional().default(false),
});

export type CreateViewInput = z.infer<typeof createViewSchema>;

export const updateViewSchema = createViewSchema.partial();
export type UpdateViewInput = z.infer<typeof updateViewSchema>;

// --------------------------------------------------------------------------
// Queries
// --------------------------------------------------------------------------

export async function listViewsForUser(userId: string): Promise<SavedViewRecord[]> {
  const { data } = await getSupabaseAdmin()
    .from("saved_table_views")
    .select("id, user_id, name, filters, sort, columns, grouping, is_default, created_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  return ((data ?? []) as SavedViewRecord[]).map(normalizeView);
}

export async function getViewById(
  id: string,
  userId: string,
): Promise<SavedViewRecord | null> {
  const { data } = await getSupabaseAdmin()
    .from("saved_table_views")
    .select("id, user_id, name, filters, sort, columns, grouping, is_default, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? normalizeView(data as SavedViewRecord) : null;
}

function normalizeView(row: SavedViewRecord): SavedViewRecord {
  return {
    ...row,
    filters: row.filters ?? {},
    sort: row.sort ?? {},
    columns: row.columns ?? [],
  };
}

// --------------------------------------------------------------------------
// Mutations
// --------------------------------------------------------------------------

export async function createView(
  userId: string,
  input: CreateViewInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  // If this view is marked default, clear any existing default.
  if (input.is_default) {
    await supabase
      .from("saved_table_views")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("saved_table_views")
    .insert({
      user_id: userId,
      name: input.name,
      filters: input.filters,
      sort: input.sort,
      columns: input.columns,
      grouping: input.grouping ?? null,
      is_default: input.is_default,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Create failed" };
  return { ok: true, id: data.id as string };
}

export async function updateView(
  id: string,
  userId: string,
  input: UpdateViewInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  if (input.is_default === true) {
    await supabase
      .from("saved_table_views")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_default", true);
  }

  const { error } = await supabase
    .from("saved_table_views")
    .update(input)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { ok: false, error: "Update failed" };
  return { ok: true };
}

export async function deleteView(id: string, userId: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("saved_table_views")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  return !error;
}
