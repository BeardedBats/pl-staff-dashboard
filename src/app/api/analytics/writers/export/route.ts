import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import { getAnalyticsWriters, writersToCsv } from "@/lib/analytics/queries";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response("Not authenticated", { status: 401 });
  if (!canViewAnalytics(viewer)) return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsed = parseAnalyticsFilters(searchParams);
  if (!parsed.ok) return new Response(parsed.error, { status: 400 });

  const rows = await getAnalyticsWriters(parsed.filters);
  const csv = writersToCsv(rows);
  const filename = `analytics-writers-${parsed.filters.dateFrom}-${parsed.filters.dateTo}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
