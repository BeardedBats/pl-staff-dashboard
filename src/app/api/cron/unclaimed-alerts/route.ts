import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { authorizeCronRequest } from "@/lib/cron/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dispatchNotification } from "@/lib/notifications/data";
import { executeCronJob } from "@/lib/cron/execution";
import { CRON_JOBS } from "@/lib/cron/jobs";
import { recipientsForSite } from "@/lib/cron/recipients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET (Vercel) / POST (manual) /api/cron/unclaimed-alerts
 *
 * Checks for entries that are still `writer_needed` with a publish date
 * inside the configured alert window (default 3 days / 72 hours), and
 * fires `unclaimed_slot` notifications to team managers.
 *
 * Dedupe: a database-enforced key is scoped to recipient, entry, and UTC
 * day so a partial attempt cannot suppress unsent managers or send twice.
 */
async function handle(request: Request) {
  const authorized = await authorizeCronRequest(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  return executeCronJob(authorized.source, CRON_JOBS["unclaimed-alerts"].execution, async () => {

  const supabase = getSupabaseAdmin();

  // Window: now → now + 72h.
  const now = new Date();
  const horizon = new Date(now);
  horizon.setHours(now.getHours() + 72);

  const { data: unclaimed } = await supabase
    .from("entries")
    .select("id, title, site, publish_date, created_by")
    .eq("content_status", "writer_needed")
    .eq("is_archived", false)
    .eq("is_historical", false)
    .not("publish_date", "is", null)
    .gte("publish_date", now.toISOString())
    .lte("publish_date", horizon.toISOString());

  const entries = (unclaimed ?? []) as Array<{
    id: string;
    title: string;
    site: "pl" | "qb";
    publish_date: string;
    created_by: string;
  }>;

  if (entries.length === 0) {
    return NextResponse.json({ ok: true, alerted: 0, skipped: 0 });
  }

  // Find manager+ user IDs once.
  const { data: managerRows } = await supabase
    .from("user_roles")
    .select("user_id, site")
    .in("role", ["manager", "admin", "eic", "operations"]);
  const managerRoles = (managerRows ?? []) as Array<{
    user_id: string;
    site: "pl" | "qb" | "both";
  }>;

  let alerted = 0;
  let skipped = 0;
  const deliveryWindow = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));

  for (const entry of entries) {
    const managerIds = recipientsForSite(managerRoles, entry.site);
    let sentForEntry = false;
    for (const userId of managerIds) {
      const delivery = await dispatchNotification({
        userId,
        entryId: entry.id,
        type: "unclaimed_slot",
        title: `"${entry.title}" still has no writer`,
        body: `Publish date is within 72 hours. ${entry.site.toUpperCase()}`,
        dedupeKey: `unclaimed:${entry.id}:${deliveryWindow}`,
      });
      if (!delivery.ok) {
        throw new Error("Unclaimed notification dispatch failed");
      }
      if (!delivery.deduplicated) sentForEntry = true;
    }
    if (sentForEntry) alerted++;
    else skipped++;
  }

  return NextResponse.json({
    ok: true,
    alerted,
    skipped,
    entries_in_window: entries.length,
  });
  });
}

export { handle as GET, handle as POST };
