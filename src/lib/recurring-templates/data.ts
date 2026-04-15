import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { scheduleRuleSchema, type ScheduleRule, describeSchedule } from "./schedule";
import type { AppSite } from "@/lib/auth/current-user";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type RecurringTemplateRecord = {
  id: string;
  title_pattern: string;
  site: AppSite;
  tier_id: string;
  tier_name: string;
  category_id: string | null;
  category_name: string | null;
  default_publish_time: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  description_template: string | null;
  season_mode_id: string;
  season_mode_name: string;
  schedule_rule: ScheduleRule;
  schedule_description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

export const createTemplateSchema = z.object({
  title_pattern: z.string().trim().min(1).max(500),
  site: z.enum(["pl", "qb"]),
  tier_id: z.uuid(),
  category_id: z.uuid().nullable().optional(),
  default_publish_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "HH:MM or HH:MM:SS")
    .nullable()
    .optional(),
  assigned_user_id: z.uuid().nullable().optional(),
  description_template: z.string().max(4000).nullable().optional(),
  season_mode_id: z.uuid(),
  schedule_rule: scheduleRuleSchema,
  is_active: z.boolean().optional().default(true),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema.partial();
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

// --------------------------------------------------------------------------
// Queries
// --------------------------------------------------------------------------

export async function listTemplates(): Promise<RecurringTemplateRecord[]> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("recurring_templates")
    .select(
      `id, title_pattern, site, tier_id, category_id, default_publish_time,
       assigned_user_id, description_template, season_mode_id, schedule_rule,
       is_active, created_at, updated_at,
       tiers!inner(name),
       categories(name),
       users!recurring_templates_assigned_user_id_fkey(display_name),
       season_modes!inner(name)`,
    )
    .order("title_pattern", { ascending: true });

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    title_pattern: string;
    site: AppSite;
    tier_id: string;
    category_id: string | null;
    default_publish_time: string | null;
    assigned_user_id: string | null;
    description_template: string | null;
    season_mode_id: string;
    schedule_rule: ScheduleRule;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    tiers: { name: string };
    categories?: { name: string } | null;
    users?: { display_name: string } | null;
    season_modes: { name: string };
  }>;

  return rows.map((row) => ({
    id: row.id,
    title_pattern: row.title_pattern,
    site: row.site,
    tier_id: row.tier_id,
    tier_name: row.tiers.name,
    category_id: row.category_id,
    category_name: row.categories?.name ?? null,
    default_publish_time: row.default_publish_time,
    assigned_user_id: row.assigned_user_id,
    assigned_user_name: row.users?.display_name ?? null,
    description_template: row.description_template,
    season_mode_id: row.season_mode_id,
    season_mode_name: row.season_modes.name,
    schedule_rule: row.schedule_rule,
    schedule_description: describeSchedule(row.schedule_rule),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function getTemplateById(
  id: string,
): Promise<RecurringTemplateRecord | null> {
  const all = await listTemplates();
  return all.find((t) => t.id === id) ?? null;
}

// --------------------------------------------------------------------------
// Mutations
// --------------------------------------------------------------------------

export async function createTemplate(
  input: CreateTemplateInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("recurring_templates")
    .insert({
      title_pattern: input.title_pattern,
      site: input.site,
      tier_id: input.tier_id,
      category_id: input.category_id ?? null,
      default_publish_time: input.default_publish_time ?? null,
      assigned_user_id: input.assigned_user_id ?? null,
      description_template: input.description_template ?? null,
      season_mode_id: input.season_mode_id,
      schedule_rule: input.schedule_rule,
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Create failed" };
  return { ok: true, id: data.id as string };
}

export async function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("recurring_templates")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: "Update failed" };
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("recurring_templates")
    .delete()
    .eq("id", id);
  return !error;
}
