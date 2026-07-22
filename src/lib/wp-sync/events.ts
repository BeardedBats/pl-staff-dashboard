import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WpSiteKey } from "@/lib/wordpress/config";

export async function beginWordPressSyncEvent(input: {
  site: WpSiteKey;
  wpPostId: number;
  eventKey: string;
  source: "webhook" | "scheduled" | "manual";
}): Promise<
  | { ok: true; eventId: string; shouldProcess: boolean; attemptCount: number }
  | { ok: false; error: string }
> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "begin_wordpress_sync_event",
    {
      p_site: input.site,
      p_wp_post_id: input.wpPostId,
      p_event_key: input.eventKey,
      p_source: input.source,
    },
  );
  const row = data?.[0];
  if (error || !row) return { ok: false, error: "Could not record sync attempt" };
  return {
    ok: true,
    eventId: row.event_id,
    shouldProcess: row.should_process,
    attemptCount: row.attempt_count,
  };
}

export async function finishWordPressSyncEvent(
  eventId: string,
  succeeded: boolean,
  errorMessage?: string,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "finish_wordpress_sync_event",
    {
      p_event_id: eventId,
      p_succeeded: succeeded,
      ...(errorMessage === undefined ? {} : { p_error: errorMessage }),
    },
  );
  return !error && data === true;
}
