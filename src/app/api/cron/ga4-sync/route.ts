import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
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
export async function POST(request: Request) {
  const authorized = await authorize(request);
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
