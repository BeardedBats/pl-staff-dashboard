import { NextResponse } from "next/server";
import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";

export const dynamic = "force-dynamic";

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

  const overview = await getAnalyticsOverview(parsed.filters);
  return NextResponse.json({ overview });
}
