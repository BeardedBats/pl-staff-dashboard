import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dispatchNotificationBulk } from "@/lib/notifications/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/unclaimed-alerts
 *
 * Checks for entries that are still `writer_needed` with a publish date
 * inside the configured alert window (default 3 days / 72 hours), and
 * fires `unclaimed_slot` notifications to team managers.
 *
 * Dedupe: uses the notifications table itself. For each unclaimed entry,
 * we look for a prior `unclaimed_slot` notification for any user in the
 * last 24 hours; if one exists, we skip to avoid spamming.
 */
export async function POST(request: Request) {
  const authorized = await authorize(request);
  if (!authorized.ok) {
    return NextResponse.json({ error: authorized.error }, { status: 401 });
  }

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
    site: string;
    publish_date: string;
    created_by: string;
  }>;

  if (entries.length === 0) {
    return NextResponse.json({ ok: true, alerted: 0, skipped: 0 });
  }

  // Find manager+ user IDs once.
  const { data: managerRows } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["manager", "admin", "eic", "operations"]);
  const managerIds = Array.from(
    new Set(
      ((managerRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
    ),
  );

  let alerted = 0;
  let skipped = 0;

  for (const entry of entries) {
    // Dedupe: skip if there's been an unclaimed_slot notification for this
    // entry in the last 24 hours.
    const dedupeWindow = new Date(now);
    dedupeWindow.setHours(now.getHours() - 24);
    const { data: recent } = await supabase
      .from("notifications")
      .select("id")
      .eq("entry_id", entry.id)
      .eq("type", "unclaimed_slot")
      .gte("created_at", dedupeWindow.toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      skipped++;
      continue;
    }

    await dispatchNotificationBulk(managerIds, {
      entryId: entry.id,
      type: "unclaimed_slot",
      title: `"${entry.title}" still has no writer`,
      body: `Publish date is within 72 hours. ${entry.site.toUpperCase()}`,
    });
    alerted++;
  }

  return NextResponse.json({
    ok: true,
    alerted,
    skipped,
    entries_in_window: entries.length,
  });
}

async function authorize(
  request: Request,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${env.CRON_SECRET}`) {
    return { ok: true };
  }
  const viewer = await getCurrentUser();
  if (viewer && isAdminPlus(viewer)) {
    return { ok: true };
  }
  return { ok: false, error: "Not authorized" };
}
