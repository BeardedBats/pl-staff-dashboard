import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { authorizeCronRequest } from "@/lib/cron/authorization";
import { syncWpProfiles } from "@/lib/wp-sync/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/profile-sync
 *
 * Refreshes display_name / bio / avatar_url on every dashboard user from
 * their WP profile. Runs every 6 hours or manually.
 */
async function handle(request: Request) {
  const authorized = await authorizeCronRequest(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  const report = await syncWpProfiles();
  return NextResponse.json({ ok: true, report });
}

export { handle as GET, handle as POST };
