import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { authorizeCronRequest } from "@/lib/cron/authorization";
import { syncGa4 } from "@/lib/analytics/ga4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// GA4 Data API can take 10–20 s for yesterday's report
export const maxDuration = 60;

/**
 * POST /api/cron/ga4-sync
 *
 * Nightly at 03:00 local — pulls yesterday's pagePath + date report and
 * upserts into `article_analytics`. Authorised via CRON_SECRET or by an
 * admin+ session. If GA4 isn't configured yet, returns a soft success so
 * the Vercel cron log stays clean.
 */
async function handle(request: Request) {
  const authorized = await authorizeCronRequest(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  const result = await syncGa4();
  if (!result.ok) {
    if (result.reason === "not_configured" || result.reason === "not_connected") {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: result.reason,
        message: result.error,
      });
    }
    return errorResponse(500, result.error);
  }

  return NextResponse.json({
    ok: true,
    rowsUpserted: result.rowsUpserted,
    matchedArticles: result.matchedArticles,
  });
}

export { handle as GET, handle as POST };
