import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { findSystemUserId } from "@/lib/recurring-templates/generator";
import { syncWpPostsForBothSites } from "@/lib/wp-sync/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/wp-sync
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
export async function POST(request: Request) {
  const authorized = await authorize(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  const systemUserId = await findSystemUserId();
  if (!systemUserId) {
    return errorResponse(
      500,
      "No admin user found to attribute system actions to.",
    );
  }

  const reports = await syncWpPostsForBothSites(systemUserId);
  return NextResponse.json({ ok: true, reports });
}

async function authorize(
  request: Request,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${env.CRON_SECRET}`) {
    return { ok: true };
  }
  const viewer = await getCurrentUser();
  if (viewer && isAdminPlusForScope(viewer, "both")) {
    return { ok: true };
  }
  return { ok: false, error: "Not authorized" };
}
