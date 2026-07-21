import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("operations runbook contract", () => {
  it("stays synchronized with environment and migration contracts", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), "scripts", "verify-operations-runbooks.mjs")],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Runbook contract verified");
  });
});
