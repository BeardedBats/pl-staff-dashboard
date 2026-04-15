import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Denormalized "recent activity" cache on entries.recent_activity.
 *
 * The audit_log is the source of truth, but querying it for every home
 * dashboard render is expensive at 200-entry scale. Instead we keep a tiny
 * JSONB array of the last 10 events per entry, updated in-place on every
 * state change.
 *
 * This is a fire-and-forget convenience layer — if the update fails we log
 * and move on. Never block a transition on recent_activity persistence.
 */

export type RecentActivityEvent = {
  type:
    | "comment"
    | "status_change"
    | "claim"
    | "graphic_update"
    | "edit"
    | "archive"
    | "created";
  actor_id: string;
  actor_name: string;
  /** One-line description shown in activity feeds. */
  label: string;
  at: string; // ISO timestamp
};

const MAX_EVENTS = 10;

/**
 * Prepend an event onto an entry's recent_activity array.
 * Caps the array length at MAX_EVENTS.
 */
export async function appendRecentActivity(
  entryId: string,
  event: RecentActivityEvent,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Read current recent_activity.
  const { data } = await supabase
    .from("entries")
    .select("recent_activity")
    .eq("id", entryId)
    .maybeSingle();

  if (!data) return;

  const current = (data.recent_activity as RecentActivityEvent[] | null) ?? [];
  const next = [event, ...current].slice(0, MAX_EVENTS);

  await supabase
    .from("entries")
    .update({ recent_activity: next })
    .eq("id", entryId);
}
