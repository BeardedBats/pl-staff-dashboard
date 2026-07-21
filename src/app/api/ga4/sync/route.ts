import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { syncGa4 } from "@/lib/analytics/ga4";

export const dynamic = "force-dynamic";
// GA4 Data API queries can take 10–20 s for wide ranges
export const maxDuration = 60;

const bodySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * POST /api/ga4/sync — manual GA4 pull. Ops-only. Use the body to force a
 * specific range (e.g. backfill a week); default is yesterday.
 */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isOperations(viewer)) {
    return errorResponse(403, "Only Operations can run GA4 sync");
  }

  const parsed = await parseJsonBody(request, bodySchema, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  const result = await syncGa4(parsed.data.dateFrom, parsed.data.dateTo);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: "INTERNAL_ERROR",
        reason: result.reason ?? null,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    rowsUpserted: result.rowsUpserted,
    matchedArticles: result.matchedArticles,
  });
}
