import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import { articlesToCsv, getAnalyticsArticles } from "@/lib/analytics/queries";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/articles/export — CSV download. Mirrors the articles
 * endpoint but returns a `text/csv` response with a download disposition.
 */
export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response("Not authenticated", { status: 401 });
  if (!canViewAnalytics(viewer)) return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsed = parseAnalyticsFilters(searchParams);
  if (!parsed.ok) return new Response(parsed.error, { status: 400 });

  const rows = await getAnalyticsArticles(parsed.filters);
  const csv = articlesToCsv(rows);
  const filename = `analytics-articles-${parsed.filters.dateFrom}-${parsed.filters.dateTo}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
