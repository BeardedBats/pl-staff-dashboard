import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("PLPD gated-data contract", () => {
  it("limits financial analytics to EIC and Operations roles", () => {
    const auth = source("src/lib/auth/current-user.ts");
    const boundary = auth.slice(
      auth.indexOf("export function canViewAnalytics"),
      auth.indexOf("export function isOperations"),
    );

    expect(boundary).toContain('hasRole(user, "eic", "operations")');
    expect(boundary).not.toContain('"admin"');
  });

  it("authorizes before invoking every financial read loader", () => {
    const routes = [
      ["src/app/api/analytics/overview/route.ts", "getAnalyticsOverview"],
      ["src/app/api/analytics/articles/route.ts", "getAnalyticsArticles"],
      ["src/app/api/analytics/writers/route.ts", "getAnalyticsWriters"],
      [
        "src/app/api/analytics/publish-to-peak/route.ts",
        "getPublishToPeakCurve",
      ],
      [
        "src/app/api/analytics/articles/export/route.ts",
        "getAnalyticsArticles",
      ],
      [
        "src/app/api/analytics/writers/export/route.ts",
        "getAnalyticsWriters",
      ],
      ["src/app/api/raptive/uploads/route.ts", "listRaptiveUploads"],
    ] as const;

    for (const [file, loader] of routes) {
      const handler = source(file).slice(source(file).indexOf("export async"));
      expect(handler.indexOf("if (!canViewAnalytics"), file).toBeGreaterThan(-1);
      expect(handler.indexOf(loader), file).toBeGreaterThan(
        handler.indexOf("if (!canViewAnalytics"),
      );
    }
  });

  it("gates server-rendered analytics before data loading", () => {
    const analyticsPage = source("src/app/(app)/analytics/page.tsx");
    const homePage = source("src/app/(app)/home/page.tsx");

    expect(analyticsPage.indexOf("if (!analyticsScope)"))
      .toBeLessThan(analyticsPage.indexOf("await Promise.all"));
    expect(homePage).toContain(
      "eicScope ? getAnalyticsMini(eicScope) : Promise.resolve(null)",
    );
  });

  it("keeps direct database and presentation escape hatches closed", () => {
    const migration = source(
      "supabase/migrations/0016_reassert_server_only_data_boundary.sql",
    );
    const databaseTest = source(
      "supabase/tests/0016_reassert_server_only_data_boundary.test.sql",
    );
    const gatedValue = source("src/components/ui/gated-value.tsx");
    const documentation = source("docs/PLPD_GATED_DATA.md");

    expect(migration).toContain(
      "REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated",
    );
    expect(databaseTest).toContain("anon has no public table privileges");
    expect(databaseTest).toContain(
      "authenticated has no public table privileges",
    );
    expect(gatedValue).not.toMatch(/\bvalue\s*[?:]/);
    expect(gatedValue).not.toMatch(/blur|filter|mask/i);
    expect(documentation).toContain(
      "DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B",
    );
    expect(documentation).toContain("EIC and Operations");
    expect(documentation).toMatch(/must\s+not be present in HTML/);
  });

  it("gives every financial chart a non-negative first render", () => {
    const helper = source("src/lib/design/chart.ts");
    const chartFiles = [
      "src/app/(app)/home/widgets/eic-widgets.tsx",
      "src/app/(app)/analytics/analytics-overview-tab.tsx",
      "src/app/(app)/analytics/analytics-trends-tab.tsx",
    ];

    expect(helper).toContain("width: 1");
    expect(helper).toContain("height: 1");
    for (const file of chartFiles) {
      const chart = source(file);
      expect(chart.match(/<ResponsiveContainer/g)?.length, file).toBe(
        chart.match(/initialDimension=/g)?.length,
      );
    }
  });
});
