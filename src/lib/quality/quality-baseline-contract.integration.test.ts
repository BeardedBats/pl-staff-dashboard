import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("quality baseline contract", () => {
  it("keeps the lab gate explicit, versioned, and wired into CI", () => {
    const budgets = JSON.parse(read("quality-budgets.json")) as {
      version: number;
      measurement: { fieldDataClaimed: boolean };
      profiles: Record<
        string,
        {
          maxFcpMs: number;
          maxLcpMs: number;
          maxCls: number;
          maxTotalBlockingTimeMs: number;
          maxEncodedBodyBytes: number;
          maxScriptEncodedBodyBytes: number;
          maxRequests: number;
          maxDomNodes: number;
        }
      >;
    };

    expect(budgets.version).toBeGreaterThanOrEqual(1);
    expect(budgets.measurement.fieldDataClaimed).toBe(false);
    expect(Object.keys(budgets.profiles)).toEqual([
      "login-mobile",
      "writer-content",
      "admin-settings",
    ]);

    for (const budget of Object.values(budgets.profiles)) {
      expect(budget.maxFcpMs).toBeGreaterThan(0);
      expect(budget.maxLcpMs).toBeLessThanOrEqual(2_500);
      expect(budget.maxCls).toBeLessThanOrEqual(0.1);
      expect(budget.maxTotalBlockingTimeMs).toBeGreaterThan(0);
      expect(budget.maxEncodedBodyBytes).toBeGreaterThan(0);
      expect(budget.maxScriptEncodedBodyBytes).toBeGreaterThan(0);
      expect(budget.maxRequests).toBeGreaterThan(0);
      expect(budget.maxDomNodes).toBeGreaterThan(0);
    }

    expect(read("package.json")).toContain(
      '"test:quality": "playwright test --config playwright.quality.config.ts"',
    );
    expect(read("playwright.quality.config.ts")).toContain(
      'process.env.QUALITY_TEST_PORT ?? "3101"',
    );
    const workflow = read(".github/workflows/database-types.yml");
    expect(workflow).toContain("run: npm run test:quality");
    expect(workflow).toContain("name: quality-baseline");

    const documentation = read("docs/QUALITY_BASELINES.md").replace(/\s+/g, " ");
    expect(documentation).toContain("not production Core Web Vitals");
    expect(documentation).toContain("manual assessment");
  });
});
