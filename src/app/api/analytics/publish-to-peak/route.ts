import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import { getAnalyticsTrends } from "@/lib/analytics/queries";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { authorizeAnalyticsFilters } from "@/lib/analytics/authorization";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/publish-to-peak
 *
 * Returns two charts worth of data in one call so the Trends tab can do a
 * single fetch:
 *   - `curve`: pageviews-per-day-since-publish averaged across articles
 *   - `heat`: pageviews bucketed by (week, day-of-week)
 *
 * Both respect the same filter set as the other analytics endpoints.
 */
export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!canViewAnalytics(viewer)) {
    return errorResponse(403, "Forbidden");
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseAnalyticsFilters(searchParams);
  if (!parsed.ok) {
    return errorResponse(400, parsed.error);
  }

  const filters = authorizeAnalyticsFilters(viewer, parsed.filters);
  if (!filters) {
    return errorResponse(403, "Forbidden");
  }

  const trends = await getAnalyticsTrends(filters);
  return NextResponse.json(trends);
}
