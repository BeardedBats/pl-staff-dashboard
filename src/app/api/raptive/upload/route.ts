import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import {
  beginRaptiveImportRun,
  commitRaptiveRows,
  failRaptiveImportRun,
  matchRaptiveRowsToEntries,
  parseRaptiveWorkbook,
} from "@/lib/analytics/raptive";
import { validateRaptiveImportLimits } from "@/lib/analytics/raptive-contract";
import {
  recordOperationalAlert,
  resolveOperationalAlert,
} from "@/lib/observability/alerts";
import { emitStructuredLog, safeErrorCode } from "@/lib/observability/structured-log";

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
  if (mode !== "preview" && mode !== "commit") {
    return errorResponse(400, "Mode must be preview or commit");
  }
  const fileLimit = validateRaptiveImportLimits(file.size, 1);
  if (!fileLimit.ok) return errorResponse(413, fileLimit.error);
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return errorResponse(400, "Upload an XLSX workbook");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseRaptiveWorkbook(buffer);
  if (!parsed.ok) {
    return errorResponse(400, parsed.error);
  }
  const limits = validateRaptiveImportLimits(file.size, parsed.rows.length);
  if (!limits.ok) return errorResponse(413, limits.error);

  if (mode === "commit" && parsed.rejectedCount > 0) {
    return errorResponse(
      409,
      "Resolve rejected workbook rows before committing the import",
    );
  }

  const safeFileName =
    file.name.split(/[\\/]/).pop()?.slice(0, 255) || "raptive-upload.xlsx";
  const importRunId =
    mode === "commit"
      ? await beginRaptiveImportRun(safeFileName, viewer.id)
      : null;
  if (mode === "commit" && !importRunId) {
    const errorId = await recordOperationalAlert({
      fingerprint: "import:raptive:control",
      severity: "critical",
      component: "import",
      eventName: "import.run_start_failed",
      errorCode: "begin_unavailable",
      summary: "Raptive import tracking could not start.",
      remediation: "Retry the import from Analytics. If it recurs, verify database availability before uploading again.",
      metadata: { import_type: "raptive", stage: "begin" },
    });
    return NextResponse.json(
      { error: "Raptive import tracking is unavailable", errorId },
      { status: 503 },
    );
  }

  let matchResult: Awaited<ReturnType<typeof matchRaptiveRowsToEntries>>;
  try {
    matchResult = await matchRaptiveRowsToEntries(parsed.rows);
  } catch (matchError) {
    const errorCode = safeErrorCode(matchError, "entry_match_unavailable");
    if (importRunId) {
      await failRaptiveImportRun(importRunId, errorCode, "matching");
    }
    const errorId = await recordOperationalAlert(
      {
        fingerprint: "import:raptive:matching",
        severity: "critical",
        component: "import",
        eventName: "import.matching_failed",
        errorCode,
        summary: "Raptive rows could not be matched to dashboard entries.",
        remediation: "Verify database availability, then retry the workbook from Analytics.",
        metadata: { import_type: "raptive", stage: "matching" },
      },
      matchError,
    );
    return NextResponse.json(
      { error: "Raptive entry matching is unavailable", errorId },
      { status: 503 },
    );
  }

  const preview = {
    fileName: file.name,
    fileSizeBytes: file.size,
    totalRows: parsed.rows.length,
    dateRange: parsed.dateRange,
    matchedCount: matchResult.matchedCount,
    unmatchedCount: matchResult.unmatchedCount,
    sampleUnmatched: matchResult.sampleUnmatched,
    dataSheetCount: parsed.dataSheetCount,
    duplicateCount: parsed.duplicateCount,
    rejectedCount: parsed.rejectedCount,
    sampleRejected: parsed.sampleRejected,
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
    importRunId!,
    matchResult.matched,
    parsed.dateRange,
    safeFileName,
    viewer.id,
    {
      matchedCount: matchResult.matchedCount,
      unmatchedCount: matchResult.unmatchedCount,
      dataSheetCount: parsed.dataSheetCount,
      duplicateCount: parsed.duplicateCount,
    },
  );
  if (!commitResult.ok) {
    await failRaptiveImportRun(importRunId!, "commit_failed", "commit");
    const errorId = await recordOperationalAlert({
      fingerprint: "import:raptive:commit",
      severity: "critical",
      component: "import",
      eventName: "import.commit_failed",
      errorCode: "commit_failed",
      summary: "Raptive import did not commit.",
      remediation: "Open Settings > Analytics, inspect the failed import attempt, and retry only after confirming its recorded outcome.",
      metadata: { import_type: "raptive", stage: "commit" },
    });
    return NextResponse.json(
      { error: commitResult.error, errorId },
      { status: 500 },
    );
  }

  await Promise.all([
    resolveOperationalAlert("import:raptive:control", "import"),
    resolveOperationalAlert("import:raptive:matching", "import"),
    resolveOperationalAlert("import:raptive:commit", "import"),
  ]);
  emitStructuredLog({
    level: "info",
    component: "import",
    event: "import.completed",
    attributes: {
      import_type: "raptive",
      import_run_id: importRunId,
      rows_inserted: commitResult.inserted,
      matched_count: matchResult.matchedCount,
      unmatched_count: matchResult.unmatchedCount,
    },
  });

  return NextResponse.json({
    ok: true,
    preview,
    inserted: commitResult.inserted,
  });
}
