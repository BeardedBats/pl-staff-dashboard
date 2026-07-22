import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("P4 workflow foundation contract", () => {
  it("pins the Today view to one ordered plain-language action", () => {
    const page = source("src/app/(app)/home/page.tsx");
    const today = source("src/lib/home/today.ts");

    expect(page).toContain("buildTodayBrief");
    expect(page).toContain("<TodayBrief brief={todayBrief}");
    expect(today.indexOf("approvals > 0")).toBeLessThan(today.indexOf("overdue.length > 0"));
    expect(today.indexOf("overdue.length > 0")).toBeLessThan(
      today.indexOf("input.myEdits.length > 0"),
    );
    expect(today).toContain("actionLabel");
  });

  it("keeps every global-search source behind server authorization", () => {
    const route = source("src/app/api/search/route.ts");
    const search = source("src/lib/search/dashboard.ts");

    expect(route.indexOf("getCurrentUser()")).toBeLessThan(
      route.indexOf("searchDashboard(viewer"),
    );
    expect(search).toContain("canViewEntryResource(viewer");
    expect(search).toContain("canViewGraphicResource(viewer");
    for (const kind of ["entry", "staff", "assignment", "graphic", "schedule"]) {
      expect(search, kind).toContain(`kind: \"${kind}\"`);
    }
    expect(search).toContain("Promise.allSettled");
  });

  it("requires role-based checklist completion rather than tour dismissal", () => {
    const tour = source("src/components/onboarding/onboarding-tour.tsx");
    const checklist = source("src/components/onboarding/setup-checklist.tsx");
    const setup = source("src/lib/onboarding/setup.ts");

    expect(tour).not.toContain("/api/users/me/onboarding");
    expect(checklist).toContain("/api/users/me/onboarding");
    expect(checklist).toContain("disabled={!allComplete || saving}");
    expect(setup).toContain("rolePriority");
  });

  it("provides inherited loading and safe recovery for every authenticated route", () => {
    expect(existsSync(path.join(root, "src/app/(app)/loading.tsx"))).toBe(true);
    expect(existsSync(path.join(root, "src/app/(app)/error.tsx"))).toBe(true);
    expect(source("src/app/(app)/error.tsx")).not.toContain("error.message");
    expect(source("src/components/search/global-search.tsx")).toContain(
      "Some results are still unavailable",
    );
    expect(source("src/app/(app)/home/manager-inbox.tsx")).toContain(
      "Request updated",
    );
  });
});
