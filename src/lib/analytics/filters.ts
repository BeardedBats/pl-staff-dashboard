import { z } from "zod";
import type { AnalyticsFilters } from "@/lib/analytics/queries";

const filterSchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  site: z.enum(["pl", "qb", "both"]).optional(),
  tierId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
});

/**
 * Build an AnalyticsFilters object from a URL search params object. Used by
 * every /api/analytics/* route. Defaults to the last 30 days when no range
 * is supplied.
 */
export function parseAnalyticsFilters(
  searchParams: URLSearchParams,
): { ok: true; filters: AnalyticsFilters } | { ok: false; error: string } {
  const now = new Date();
  const defaultTo = now.toISOString().slice(0, 10);
  const from30 = new Date(now);
  from30.setDate(from30.getDate() - 29);
  const defaultFrom = from30.toISOString().slice(0, 10);

  const raw = {
    dateFrom: searchParams.get("dateFrom") || defaultFrom,
    dateTo: searchParams.get("dateTo") || defaultTo,
    site: searchParams.get("site") || undefined,
    tierId: searchParams.get("tierId") || undefined,
    categoryId: searchParams.get("categoryId") || undefined,
    authorId: searchParams.get("authorId") || undefined,
  };

  const parsed = filterSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid filter params" };
  }

  // Sanity: dateFrom must be <= dateTo
  if (parsed.data.dateFrom > parsed.data.dateTo) {
    return { ok: false, error: "dateFrom must be on or before dateTo" };
  }

  return { ok: true, filters: parsed.data };
}
