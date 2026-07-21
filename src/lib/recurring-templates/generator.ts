import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { renderTitle } from "./tokens";
import {
  combineDateAndTime,
  computeOccurrencesInRange,
  type ScheduleRule,
} from "./schedule";
import type { AppSite } from "@/lib/auth/current-user";

/**
 * Generator: nightly cron that ensures recurring entries exist for the
 * next N days. Per Nick's config: N = 14 days.
 *
 * Flow for each active template whose season_mode matches the currently
 * active season:
 *
 *   1. Compute the list of occurrence dates in [today, today+14].
 *   2. For each occurrence, render the title using the template's
 *      title_pattern and the token renderer.
 *   3. Look for an existing entry with series_id = template.id and a
 *      publish_date that falls within the same calendar day. If one
 *      exists, skip.
 *   4. Otherwise insert a new entry in writer_needed state with the
 *      template's defaults. If the template has an assigned user, flip
 *      the entry straight to 'claimed' and attach the user as primary
 *      author.
 *   5. Seed the entry's checklist from checklist_items for that tier.
 *
 * The function returns a small report that the cron endpoint surfaces
 * back to the caller (or logs if called from the cron).
 */

export const GENERATION_WINDOW_DAYS = 14;

export type GeneratorReport = {
  templatesProcessed: number;
  templatesSkipped: number;
  entriesCreated: number;
  entriesSkipped: number;
  errors: Array<{ templateId: string; message: string }>;
};

type TemplateRow = {
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
};

export async function runGenerator(): Promise<GeneratorReport> {
  const supabase = getSupabaseAdmin();
  const report: GeneratorReport = {
    templatesProcessed: 0,
    templatesSkipped: 0,
    entriesCreated: 0,
    entriesSkipped: 0,
    errors: [],
  };

  // Resolve a real admin user to use as the `created_by` fallback when a
  // template has no assigned_user_id. We need a real UUID so the FK
  // constraint on entries.created_by holds.
  const systemUserId = await findSystemUserId();
  if (!systemUserId) {
    report.errors.push({
      templateId: "system",
      message:
        "No admin/eic/operations user found to use as system fallback for created_by.",
    });
    return report;
  }

  // 1. Which season mode is currently active? Templates for any other
  //    season are paused.
  const { data: activeSeason } = await supabase
    .from("season_modes")
    .select("id, name, auto_switch_start")
    .eq("is_active", true)
    .maybeSingle();

  const seasonStart = activeSeason?.auto_switch_start
    ? new Date(activeSeason.auto_switch_start as string)
    : null;

  // 2. Fetch active templates for the active season (or all active templates
  //    if no season is currently active — fail-safe).
  let templateQuery = supabase
    .from("recurring_templates")
    .select(
      "id, title_pattern, site, tier_id, category_id, default_publish_time, assigned_user_id, description_template, season_mode_id, schedule_rule, is_active",
    )
    .eq("is_active", true);
  if (activeSeason) {
    templateQuery = templateQuery.eq("season_mode_id", activeSeason.id as string);
  }

  const { data: templates } = await templateQuery;
  const templateRows = (templates ?? []) as unknown as TemplateRow[];

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(now.getDate() + GENERATION_WINDOW_DAYS);

  for (const template of templateRows) {
    try {
      report.templatesProcessed++;

      const occurrences = computeOccurrencesInRange(
        template.schedule_rule,
        now,
        windowEnd,
      );

      for (const dayUtc of occurrences) {
        const publishAt = combineDateAndTime(
          dayUtc,
          template.default_publish_time,
        );

        // Skip if an entry already exists for this template + day.
        // We match by series_id + a publish_date that falls on the same
        // calendar day (UTC). This stops duplicate inserts when the cron
        // runs multiple times a day.
        const dayStart = new Date(dayUtc);
        const dayEnd = new Date(dayUtc);
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

        const { data: existing } = await supabase
          .from("entries")
          .select("id")
          .eq("series_id", template.id)
          .gte("publish_date", dayStart.toISOString())
          .lt("publish_date", dayEnd.toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          report.entriesSkipped++;
          continue;
        }

        const title = renderTitle(template.title_pattern, {
          targetDate: dayUtc,
          seasonStart,
        });

        const contentStatus = template.assigned_user_id
          ? "claimed"
          : "writer_needed";

        const { data: inserted, error } = await supabase
          .from("entries")
          .insert({
            title,
            description: template.description_template,
            site: template.site,
            tier_id: template.tier_id,
            category_id: template.category_id,
            series_id: template.id,
            publish_date: publishAt.toISOString(),
            publish_date_precision: template.default_publish_time
              ? "exact"
              : "loose_time",
            content_status: contentStatus,
            created_by: template.assigned_user_id ?? systemUserId,
          })
          .select("id")
          .single();

        if (error || !inserted) {
          report.errors.push({
            templateId: template.id,
            message: `Failed to create generated entry: ${title}`,
          });
          continue;
        }

        const newEntryId = inserted.id as string;

        // Pre-assign the author if the template specifies one.
        if (template.assigned_user_id) {
          await supabase.from("entry_authors").insert({
            entry_id: newEntryId,
            user_id: template.assigned_user_id,
            role: "primary",
          });
        }

        // Seed the tier's checklist items onto the new entry.
        await seedChecklistForEntry(newEntryId, template.tier_id);

        // Audit row.
        await supabase.from("audit_log").insert({
          entry_id: newEntryId,
          user_id: template.assigned_user_id ?? systemUserId,
          action: "created",
          new_value: `auto-generated from template ${template.title_pattern}`,
        });

        report.entriesCreated++;
      }
    } catch {
      report.errors.push({
        templateId: template.id,
        message: "Failed to process recurring template",
      });
    }
  }

  return report;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

async function seedChecklistForEntry(
  entryId: string,
  tierId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: items } = await supabase
    .from("checklist_items")
    .select("id")
    .eq("tier_id", tierId);
  const rows = ((items ?? []) as Array<{ id: string }>).map((item) => ({
    entry_id: entryId,
    checklist_item_id: item.id,
    is_completed: false,
  }));
  if (rows.length > 0) {
    await supabase.from("entry_checklist").insert(rows);
  }
}

/**
 * Resolve a real system user ID for the "created_by" fallback on entries
 * that are auto-generated without a pre-assigned author. Returns the
 * first admin / EIC / operations user's ID, or null if none exist.
 */
export async function findSystemUserId(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "eic", "operations"])
    .limit(1)
    .maybeSingle();
  return (data?.user_id as string | null) ?? null;
}
