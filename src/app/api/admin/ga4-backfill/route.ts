import { NextResponse } from "next/server";
import { z } from "zod";
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

  const result = await syncGa4(date_from, date_to);
  if (!result.ok) {
    // Surface the not-connected case explicitly so the UI can tell the user
    // to go through Settings → Analytics first.
    if (result.reason === "not_connected" || result.reason === "not_configured") {
      return NextResponse.json(
        {
          error:
            "GA4 not connected. Connect via Settings → Analytics first.",
          reason: result.reason,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: result.error, reason: result.reason ?? null },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    rowsUpserted: result.rowsUpserted,
    matchedArticles: result.matchedArticles,
    dateFrom: date_from,
    dateTo: date_to,
  });
}
