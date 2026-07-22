import { describe, expect, it } from "vitest";
import {
  MAX_RAPTIVE_IMPORT_ROWS,
  MAX_RAPTIVE_UPLOAD_BYTES,
  validateRaptiveImportLimits,
} from "./raptive-contract";

describe("Raptive measured import envelope", () => {
  it("accepts the supported boundary", () => {
    expect(
      validateRaptiveImportLimits(
        MAX_RAPTIVE_UPLOAD_BYTES,
        MAX_RAPTIVE_IMPORT_ROWS,
      ),
    ).toEqual({ ok: true });
  });

  it("requires measured escalation beyond 10 MB or 100,000 rows", () => {
    expect(validateRaptiveImportLimits(MAX_RAPTIVE_UPLOAD_BYTES + 1, 1)).toEqual({
      ok: false,
      error: "Workbook must be between 1 byte and 10 MB",
    });
    expect(validateRaptiveImportLimits(1, MAX_RAPTIVE_IMPORT_ROWS + 1)).toEqual({
      ok: false,
      error: "Workbook must contain between 1 and 100,000 valid rows",
    });
  });
});
