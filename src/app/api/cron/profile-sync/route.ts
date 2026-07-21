import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { authorizeCronRequest } from "@/lib/cron/authorization";
import { executeCronJob } from "@/lib/cron/execution";
import { syncWpProfiles } from "@/lib/wp-sync/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET (Vercel) / POST (manual) /api/cron/profile-sync
 *
 * Refreshes display_name / bio / avatar_url on every dashboard user from
 * their WP profile. Runs every 6 hours or manually.
 */
async function handle(request: Request) {
  const authorized = await authorizeCronRequest(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  return executeCronJob(authorized.source, {
    name: "profile-sync",
    intervalSeconds: 6 * 60 * 60,
  }, async () => {
    const report = await syncWpProfiles();
    if (report.errors.length > 0) {
      return errorResponse(502, "WordPress profile sync incomplete");
    }
    return NextResponse.json({ ok: true, report });
  });
}

export { handle as GET, handle as POST };
