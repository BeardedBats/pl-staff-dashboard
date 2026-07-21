import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import { getAnalyticsArticles } from "@/lib/analytics/queries";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { authorizeAnalyticsFilters } from "@/lib/analytics/authorization";

export const dynamic = "force-dynamic";

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
  const rows = await getAnalyticsArticles(filters);
  return NextResponse.json({ rows });
}
