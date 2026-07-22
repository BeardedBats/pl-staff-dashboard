import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("PLPD accessibility and visual-regression contract", () => {
  it("pins WCAG A/AA checks to every authenticated route without exclusions", () => {
    const browser = source("tests/quality/accessibility-interactions.spec.ts");

    expect(browser).toContain("every authenticated route passes");
    expect(browser).toContain('"wcag22aa"');
    expect(browser).toContain('"/settings?tab=checklists"');
    expect(browser).toContain('"/settings?tab=analytics"');
    expect(browser).not.toContain(".exclude(");
  });

  it("pins keyboard focus trapping, navigation, and trigger restoration", () => {
    const browser = source("tests/quality/accessibility-interactions.spec.ts");
    const dialog = source("src/app/(app)/settings/template-dialog.tsx");
    const menu = source("src/components/ui/dropdown-menu.tsx");

    expect(browser).toContain("focus escaped the mobile drawer");
    expect(browser).toContain("focus escaped the template dialog");
    expect(browser).toContain('press("ArrowRight")');
    expect(browser).toContain("expectVisibleFocus(trigger)");
    expect(browser).toContain("expectVisibleFocus(newTemplate)");
    expect(browser).toContain("expectVisibleFocus(userMenu)");
    expect(dialog).toContain("onCloseAutoFocus");
    expect(menu).toContain("modal={false}");
  });

  it("keeps committed visual baselines for shared primitives and representative pages", () => {
    const config = source("playwright.quality.config.ts");
    const browser = source("tests/quality/visual-regression.spec.ts");
    const snapshotRoot = path.join(
      root,
      "tests/quality/__snapshots__/visual-regression.spec.ts",
    );

    expect(config).toContain("snapshotPathTemplate");
    expect(config).toContain("maxDiffPixelRatio: 0.03");
    expect(browser).toContain("maxDiffPixelRatio: 0.05");
    for (const baseline of [
      "login-mobile-dark.png",
      "admin-home-desktop.png",
      "archive-mobile.png",
      "template-dialog-primitives.png",
      "eic-analytics-desktop.png",
    ]) {
      expect(browser, baseline).toContain(`toHaveScreenshot(\"${baseline}\"`);
      expect(existsSync(path.join(snapshotRoot, baseline)), baseline).toBe(true);
    }
  });
});
