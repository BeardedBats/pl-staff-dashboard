import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import {
  commitRaptiveRows,
  matchRaptiveRowsToEntries,
  parseRaptiveWorkbook,
} from "@/lib/analytics/raptive";

export const dynamic = "force-dynamic";
// Reasonable ceiling: Raptive sheets for ~6 months are typically under 5MB
export const maxDuration = 60;

/**
 * POST /api/raptive/upload
 *
 * Expects multipart/form-data with:
 *   - file: the .xlsx file
 *   - mode: "preview" (default) or "commit"
 *
 * Preview mode parses the file + matches URLs and returns counts without
 * touching the database. Commit mode does the same + writes to
 * raptive_revenue and logs the upload. Both flows are Operations-only.
 */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isOperations(viewer)) {
    return errorResponse(403, "Only Operations can upload Raptive data");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "Expected multipart/form-data");
  }

  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  if (!(file instanceof File)) {
    return errorResponse(400, "Missing file field");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseRaptiveWorkbook(buffer);
  if (!parsed.ok) {
    return errorResponse(400, parsed.error);
  }

  const matchResult = await matchRaptiveRowsToEntries(parsed.rows);

  const preview = {
    fileName: file.name,
    totalRows: parsed.rows.length,
    dateRange: parsed.dateRange,
    matchedCount: matchResult.matchedCount,
    unmatchedCount: matchResult.unmatchedCount,
    sampleUnmatched: matchResult.sampleUnmatched,
    // Never leak all rows back — only summary stats
    totalEarnings: parsed.rows.reduce(
      (acc, r) => acc + (Number(r.earnings) || 0),
      0,
    ),
  };

  if (mode !== "commit") {
    return NextResponse.json({ ok: true, preview });
  }

  const commitResult = await commitRaptiveRows(
    matchResult.matched,
    parsed.dateRange,
    file.name,
    viewer.id,
  );
  if (!commitResult.ok) {
    return errorResponse(500, commitResult.error);
  }

  return NextResponse.json({
    ok: true,
    preview,
    inserted: commitResult.inserted,
  });
}
