export const MAX_RAPTIVE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_RAPTIVE_IMPORT_ROWS = 100_000;

export function validateRaptiveImportLimits(
  fileBytes: number,
  rowCount: number,
): { ok: true } | { ok: false; error: string } {
  if (!Number.isSafeInteger(fileBytes) || fileBytes < 1 || fileBytes > MAX_RAPTIVE_UPLOAD_BYTES) {
    return { ok: false, error: "Workbook must be between 1 byte and 10 MB" };
  }
  if (!Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > MAX_RAPTIVE_IMPORT_ROWS) {
    return { ok: false, error: "Workbook must contain between 1 and 100,000 valid rows" };
  }
  return { ok: true };
}
