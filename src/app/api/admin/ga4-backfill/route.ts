import { NextResponse } from "next/server";
import { z } from "zod";
import { addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { syncGa4 } from "@/lib/analytics/ga4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Multi-year GA4 pulls can take 30-60s in practice; give it room.
export const maxDuration = 120;

/**
 * POST /api/admin/ga4-backfill
 *
 * Pulls GA4 pageview / session data for an arbitrary date range and
 * upserts it into article_analytics. The nightly cron only fetches
 * yesterday — this route is the manual escape hatch for backfilling
 * historical metrics after the historical-import job runs.
 *
 * Auth: Operations role only.
 *
 * GA4 will attribute pageviews to whichever entry's wp_post_url normalises
 * to the same pagePath, so backfilling without first running the
 * historical import will leave most rows orphaned.
 */

const bodySchema = z.object({
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date_from must be YYYY-MM-DD"),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date_to must be YYYY-MM-DD"),
});

// GA4's runReport caps results at 100k rows ordered by pageviews desc. Across
// a multi-year span that cap fills entirely with peak-traffic days, so quieter
// periods never appear in the response and the chart looks like a cliff.
// Chunking month by month gives each window its own 100k budget.
function generateMonthlyWindows(
  dateFrom: string,
  dateTo: string,
): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = [];
  const endDate = parseISO(dateTo);
  let windowStart = parseISO(dateFrom);

  while (windowStart <= endDate) {
    const monthEnd = endOfMonth(windowStart);
    const windowEnd = monthEnd > endDate ? endDate : monthEnd;
    windows.push({
      from: format(windowStart, "yyyy-MM-dd"),
      to: format(windowEnd, "yyyy-MM-dd"),
    });
    windowStart = startOfMonth(addMonths(windowStart, 1));
  }

  return windows;
}

export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOperations(viewer)) {
    return NextResponse.json(
      { error: "Only Operations can run GA4 backfill" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { date_from, date_to } = parsed.data;
  if (date_from > date_to) {
    return NextResponse.json(
      { error: "date_from must be on or before date_to" },
      { status: 400 },
    );
  }

  const monthlyWindows = generateMonthlyWindows(date_from, date_to);

  let totalRowsUpserted = 0;
  let totalMatchedArticles = 0;
  const errors: string[] = [];

  for (const window of monthlyWindows) {
    const result = await syncGa4(window.from, window.to);
    if (result.ok) {
      totalRowsUpserted += result.rowsUpserted;
      // May double-count an article that appears in multiple months; accepted
      // tradeoff to avoid threading a Set through syncGa4's return shape.
      totalMatchedArticles += result.matchedArticles;
      continue;
    }
    // Config-level failures won't fix themselves between months — bail out so
    // the operator can reconnect instead of waiting through dozens of retries.
    if (result.reason === "not_connected" || result.reason === "not_configured") {
      return NextResponse.json(
        {
          error: "GA4 not connected. Connect via Settings → Analytics first.",
          reason: result.reason,
        },
        { status: 400 },
      );
    }
    errors.push(`${window.from} → ${window.to}: ${result.error}`);
  }

  return NextResponse.json({
    ok: true,
    rowsUpserted: totalRowsUpserted,
    matchedArticles: totalMatchedArticles,
    dateFrom: date_from,
    dateTo: date_to,
    monthsProcessed: monthlyWindows.length,
    errors,
  });
}
