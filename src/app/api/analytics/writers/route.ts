import { NextResponse } from "next/server";
import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import { getAnalyticsWriters } from "@/lib/analytics/queries";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { authorizeAnalyticsFilters } from "@/lib/analytics/authorization";

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

  const filters = authorizeAnalyticsFilters(viewer, parsed.filters);
  if (!filters) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await getAnalyticsWriters(filters);
  return NextResponse.json({ rows });
}
