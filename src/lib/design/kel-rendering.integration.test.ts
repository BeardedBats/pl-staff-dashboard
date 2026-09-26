import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");

describe("Kel scrolling and compositing repairs", () => {
  it("uses an opaque sticky table header in both themes", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--plpd-fill-table-header: #1B3156;");
    expect(css).toContain("--plpd-fill-table-header: var(--plpd-light-table-header);");
    expect(css).toMatch(/\.plpd-table th\s*\{[^}]*background: var\(--plpd-fill-table-header\)/);
  });

  it("keeps portable filters configurable without filtering the app mesh repeatedly", () => {
    expect(read("packages/kel-design-system/tokens.css")).toContain("--kel-backdrop: contrast(1.54) saturate(1.35);");
    expect(read("src/app/globals.css")).toContain("--kel-backdrop: none;");
    expect(read("packages/kel-design-system/components.css")).not.toContain("backdrop-filter: contrast(");
  });

  it("preserves horizontal tab access without a vertical scrollbar", () => {
    expect(read("src/components/ui/tabs.tsx")).toContain("overflow-x-auto overflow-y-hidden");
  });
});
