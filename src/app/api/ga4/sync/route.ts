import { NextResponse } from "next/server";
import { z } from "zod";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOperations(viewer)) {
    return NextResponse.json(
      { error: "Only Operations can run GA4 sync" },
      { status: 403 },
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — default window
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = await syncGa4(parsed.data.dateFrom, parsed.data.dateTo);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, reason: result.reason ?? null },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    rowsUpserted: result.rowsUpserted,
    matchedArticles: result.matchedArticles,
  });
}
