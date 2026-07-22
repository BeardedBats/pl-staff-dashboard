import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const srcRoot = path.join(root, "src");

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function productionTsx(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) return productionTsx(absolute);
    return absolute.endsWith(".tsx") && !absolute.endsWith(".test.tsx")
      ? [absolute]
      : [];
  });
}

describe("PLPD responsive and readable-text contract", () => {
  it("never hides readable copy with ellipsis or line clamps", () => {
    const violations = productionTsx(srcRoot).flatMap((file) => {
      const contents = readFileSync(file, "utf8");
      return /(?:\btruncate\b|line-clamp)/.test(contents)
        ? [path.relative(root, file)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("enforces the 14px readable minimum with only canonical compact chips exempt", () => {
    const css = source("src/app/globals.css");
    const badge = source("src/components/ui/badge.tsx");
    const bell = source("src/components/notifications/notification-bell.tsx");

    expect(css).toMatch(
      /:where\([\s\S]*?\.text-xs[\s\S]*?\.text-\\\[13px\\\][\s\S]*?\):not\(\[data-plpd-compact-label\]\)[\s\S]*?font-size: var\(--plpd-type-body\)/,
    );
    expect(badge).toContain("data-plpd-compact-label");
    expect(bell).toContain("data-plpd-compact-label");
  });

  it("keeps tablet navigation full-width and reserves the persistent sidebar for desktop", () => {
    const layout = source("src/app/(app)/layout.tsx");
    const header = source("src/components/layout/header.tsx");

    expect(layout).toContain("hidden lg:block");
    expect(layout).toContain("p-4 sm:p-5 lg:p-6");
    expect(header).toContain("lg:hidden");
  });

  it("pins the production browser matrix to mobile, tablet, and desktop widths", () => {
    const browser = source("tests/quality/responsive-boundary.spec.ts");

    expect(browser).toContain('name: "mobile", width: 390');
    expect(browser).toContain('name: "tablet", width: 768');
    expect(browser).toContain('name: "desktop", width: 1440');
    expect(browser).toContain("assertNoPageOverflow");
    expect(browser).toContain("assertReadableText");
  });
});
