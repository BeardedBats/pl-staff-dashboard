import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { authorizeCronRequest } from "@/lib/cron/authorization";
import { executeCronJob } from "@/lib/cron/execution";
import { findSystemUserId } from "@/lib/recurring-templates/generator";
import { syncWpPostsForBothSites } from "@/lib/wp-sync/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET (Vercel) / POST (manual) /api/cron/wp-sync
 *
 * Polls WordPress for posts modified since the last sync and reconciles
 * them with the dashboard's `entries` table. Picks up new drafts that
 * writers create directly in wp-admin (without going through the
 * dashboard), updates status for entries that have been scheduled or
 * published on WP, and stores the last-sync timestamp in global_settings.
 *
 * Auth: either `Authorization: Bearer $CRON_SECRET` (Vercel Cron) or an
 * admin+ logged-in user (manual "Sync now" button in settings).
 */
async function handle(request: Request) {
  const authorized = await authorizeCronRequest(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  return executeCronJob(authorized.source, {
    name: "wp-sync",
    intervalSeconds: 5 * 60,
  }, async () => {
    const systemUserId = await findSystemUserId();
    if (!systemUserId) {
      return errorResponse(
        500,
        "No admin user found to attribute system actions to.",
      );
    }

    const reports = await syncWpPostsForBothSites(systemUserId);
    if (reports.some((report) => report.errors.length > 0)) {
      return errorResponse(502, "WordPress post sync incomplete");
    }
    return NextResponse.json({ ok: true, reports });
  });
}

export { handle as GET, handle as POST };
