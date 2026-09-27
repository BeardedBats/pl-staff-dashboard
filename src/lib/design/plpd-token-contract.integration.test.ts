import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");

function compact(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function rootTokens() {
  const match = css.match(/:root\s*{([\s\S]*?)\n}/);
  if (!match) throw new Error("PLPD :root token registry is missing");

  return new Map(
    [...match[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)].map(
      ([, name, value]) => [name, compact(value)],
    ),
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    return statSync(absolute).isDirectory()
      ? sourceFiles(absolute)
      : absolute.endsWith(".tsx")
        ? [absolute]
        : [];
  });
}

describe("Kel design-token compatibility contract", () => {
  it("maps legacy utilities to approved Kel colors and measured roles", () => {
    const tokens = rootTokens();
    const expected = {
      "surface-1": "var(--kel-canvas)",
      "surface-2": "var(--kel-deep-navy)",
      "surface-3": "var(--kel-navy)",
      cyan: "var(--kel-link)",
      amber: "var(--kel-amber)",
      green: "var(--kel-success)",
      red: "var(--kel-red)",
      blue: "var(--kel-periwinkle)",
      violet: "var(--kel-violet)",
      gold: "var(--kel-amber)",
      "val-pos": "var(--kel-success)",
      "val-neg": "var(--kel-red)",
      "plpd-sidebar-width": "256px",
      "plpd-table-header-height": "44px",
      "plpd-table-row-height": "62px",
      "plpd-type-page-title": "26px",
      "plpd-type-section-title": "15px",
      "plpd-type-body": "14px",
      "plpd-weight-hero": "700",
      "plpd-weight-section": "700",
    };

    for (const [name, value] of Object.entries(expected)) {
      expect(tokens.get(name), `--${name}`).toBe(value);
    }
  });

  it("centralizes exact gradients, shadows, mesh, and Tailwind exposure", () => {
    const tokens = rootTokens();

    expect(tokens.get("plpd-gradient-action-blue")).toBe(
      "var(--kel-primary-gradient)",
    );
    expect(tokens.get("plpd-gradient-dropdown")).toBe(
      "linear-gradient(var(--kel-input-fill),var(--kel-input-fill))",
    );
    expect(tokens.get("plpd-gradient-highlight")).toBe(
      "linear-gradient(var(--kel-selection),var(--kel-selection))",
    );
    expect(tokens.get("plpd-shadow-panel")).toBe(
      "var(--kel-shadow)",
    );

    const mesh = tokens.get("plpd-mesh-image");
    expect(mesh).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(mesh).toContain("%3csvg%20width%3d%222364%22%20height%3d%222589%22");
    expect(css).toContain("background-image: var(--kel-header-fade), var(--kel-blue-wash), var(--plpd-mesh-image)");
    expect(css).toContain("--text-plpd-page-title: var(--plpd-type-page-title)");
    expect(css).toContain("--spacing-plpd-table-row: var(--plpd-table-row-height)");
    expect(css).toContain("--shadow-plpd-card: var(--plpd-shadow-card)");
  });

  it("keeps visual literals out of TSX consumers", () => {
    const violations = sourceFiles(path.join(root, "src")).flatMap((file) => {
      const contents = readFileSync(file, "utf8");
      return /#[0-9a-f]{3,8}|rgba?\(|(?:linear|radial)-gradient\(/i.test(contents)
        ? [path.relative(root, file)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("records the reviewed authority and keeps derived values explicit", () => {
    const documentation = readFileSync(
      path.join(root, "docs/PLPD_DESIGN_TOKENS.md"),
      "utf8",
    );
    expect(documentation).toContain(
      "DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B",
    );
    expect(documentation).toContain("stand-ins");
    expect(documentation).toContain("Derived application tokens");

    const layout = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('variable: "--font-instrument-sans"');
    expect(layout).toContain('variable: "--font-inter"');
  });
});
