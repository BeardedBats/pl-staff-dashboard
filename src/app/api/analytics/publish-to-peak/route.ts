import { NextResponse } from "next/server";
import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import {
  getDayOfWeekHeatmap,
  getPublishToPeakCurve,
} from "@/lib/analytics/queries";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canViewAnalytics(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseAnalyticsFilters(searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const filters = authorizeAnalyticsFilters(viewer, parsed.filters);
  if (!filters) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [curve, heat] = await Promise.all([
    getPublishToPeakCurve(filters),
    getDayOfWeekHeatmap(filters),
  ]);

  return NextResponse.json({ curve, heat });
}
