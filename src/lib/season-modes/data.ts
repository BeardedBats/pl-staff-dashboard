import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type SeasonModeRecord = {
  id: string;
  name: string;
  is_active: boolean;
  auto_switch_start: string | null;
  auto_switch_end: string | null;
  created_at: string;
};

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

export const updateSeasonModeSchema = z
  .object({
    auto_switch_start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
      .nullable()
      .optional(),
    auto_switch_end: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      !value.auto_switch_start ||
      !value.auto_switch_end ||
      value.auto_switch_start <= value.auto_switch_end,
    {
      message: "Start date must be on or before end date",
      path: ["auto_switch_end"],
    },
  );

// --------------------------------------------------------------------------
// Queries
// --------------------------------------------------------------------------

export async function listSeasonModes(): Promise<SeasonModeRecord[]> {
  const { data } = await getSupabaseAdmin()
    .from("season_modes")
    .select("id, name, is_active, auto_switch_start, auto_switch_end, created_at")
    .order("created_at", { ascending: true });
  return ((data ?? []) as SeasonModeRecord[]).map((r) => ({
    ...r,
    is_active: Boolean(r.is_active),
  }));
}

export async function getActiveSeasonMode(): Promise<SeasonModeRecord | null> {
  const { data } = await getSupabaseAdmin()
    .from("season_modes")
    .select("id, name, is_active, auto_switch_start, auto_switch_end, created_at")
    .eq("is_active", true)
    .maybeSingle();
  return data ? { ...(data as SeasonModeRecord), is_active: true } : null;
}

// --------------------------------------------------------------------------
// Mutations
// --------------------------------------------------------------------------

/** Flip the active flag to exactly one season mode. */
export async function activateSeasonMode(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: activated, error } = await supabase.rpc(
    "activate_season_mode",
    { p_mode_id: id },
  );

  if (error || !activated) {
    return { ok: false, error: "Failed to activate season mode" };
  }
  return { ok: true };
}

export async function updateSeasonMode(
  id: string,
  input: z.infer<typeof updateSeasonModeSchema>,
): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("season_modes")
    .update(input)
    .eq("id", id);
  return !error;
}
