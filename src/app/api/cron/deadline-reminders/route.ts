import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dispatchNotification } from "@/lib/notifications/data";
import { authorizeCronRequest } from "@/lib/cron/authorization";
import { executeCronJob } from "@/lib/cron/execution";
import { CRON_JOBS } from "@/lib/cron/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET (Vercel) / POST (manual) /api/cron/deadline-reminders
 *
 * Fires `deadline_approaching` notifications to the primary author and each
 * claimed editor for any entry whose `publish_date` lands inside the
 * configured reminder window (default 24h). Dedupes against the
 * a database-enforced per-recipient key so retries cannot send the same
 * deadline notification twice.
 */
async function handle(request: Request) {
  const authorized = await authorizeCronRequest(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  return executeCronJob(authorized.source, CRON_JOBS["deadline-reminders"].execution, async () => {

  const supabase = getSupabaseAdmin();

  const { data: setting } = await supabase
    .from("global_settings")
    .select("value")
    .eq("key", "deadline_reminder_hours")
    .maybeSingle();
  const rawValue = setting?.value;
  const hours =
    typeof rawValue === "number" && rawValue > 0
      ? rawValue
      : typeof rawValue === "string" && Number(rawValue) > 0
        ? Number(rawValue)
        : 24;

  const now = new Date();
  const horizon = new Date(now);
  horizon.setHours(horizon.getHours() + hours);

  const { data: entryRows } = await supabase
    .from("entries")
    .select("id, title, publish_date")
    .eq("is_archived", false)
    .eq("is_historical", false)
    .neq("editor_status", "published")
    .not("publish_date", "is", null)
    .gte("publish_date", now.toISOString())
    .lte("publish_date", horizon.toISOString());

  const entries = (entryRows ?? []) as Array<{
    id: string;
    title: string;
    publish_date: string;
  }>;

  let notificationsSent = 0;
  let notificationsSkipped = 0;

  for (const entry of entries) {
    const [{ data: authorRows }, { data: editorRows }] = await Promise.all([
      supabase
        .from("entry_authors")
        .select("user_id")
        .eq("entry_id", entry.id)
        .eq("role", "primary"),
      supabase.from("entry_editors").select("user_id").eq("entry_id", entry.id),
    ]);

    const recipientIds = Array.from(
      new Set([
        ...((authorRows ?? []) as Array<{ user_id: string }>).map(
          (r) => r.user_id,
        ),
        ...((editorRows ?? []) as Array<{ user_id: string }>).map(
          (r) => r.user_id,
        ),
      ]),
    );

    if (recipientIds.length === 0) continue;

    for (const userId of recipientIds) {
      const { data: userRow } = await supabase
        .from("users")
        .select("timezone")
        .eq("id", userId)
        .maybeSingle();
      const tz = (userRow?.timezone as string | null) ?? "America/New_York";

      const formatted = new Date(entry.publish_date).toLocaleString("en-US", {
        timeZone: tz,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });

      const delivery = await dispatchNotification({
        userId,
        entryId: entry.id,
        type: "deadline_approaching",
        title: `Deadline approaching: ${entry.title}`,
        body: `Due in less than ${hours}h — ${formatted}`,
        dedupeKey: `deadline:${entry.id}:${entry.publish_date}`,
      });
      if (!delivery.ok) {
        throw new Error("Deadline notification dispatch failed");
      }
      if (delivery.deduplicated) notificationsSkipped++;
      else notificationsSent++;
    }
  }

  return NextResponse.json({
    ok: true,
    entriesChecked: entries.length,
    notificationsSent,
    notificationsSkipped,
  });
  });
}

export { handle as GET, handle as POST };
