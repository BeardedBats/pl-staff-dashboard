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

describe("PLPD design-token contract", () => {
  it("preserves the guide's canonical colors and measured roles", () => {
    const tokens = rootTokens();
    const expected = {
      "surface-1": "#13152a",
      "surface-2": "#181a2c",
      "surface-3": "#21243a",
      "surface-4": "#262940",
      "surface-5": "#2e3150",
      cyan: "#55e8ff",
      "cyan-header": "#73efff",
      amber: "#ffc277",
      "amber-muted": "rgba(255,194,119,0.82)",
      "border-sidebar": "rgba(85,232,255,0.12)",
      "border-tab": "rgba(255,255,255,0.13)",
      "border-table": "rgba(118,138,190,0.22)",
      "border-row": "rgba(140,165,210,0.11)",
      "border-thead": "rgba(157,244,255,0.22)",
      "row-a": "rgba(48,58,97,0.46)",
      "row-b": "rgba(42,51,85,0.38)",
      "row-bn": "rgba(34,40,63,0.3)",
      green: "#34d399",
      red: "#f4707c",
      blue: "#3da9f5",
      violet: "#a78bfa",
      gold: "#f5b950",
      "val-pos": "#7fc8a9",
      "val-neg": "#d98f97",
      "plpd-sidebar-width": "320px",
      "plpd-table-header-height": "34.5px",
      "plpd-table-row-height": "62px",
      "plpd-type-page-title": "36px",
      "plpd-type-section-title": "24px",
      "plpd-type-body": "14px",
      "plpd-weight-hero": "800",
      "plpd-weight-section": "900",
      "plpd-fill-alert-success": "rgba(52,211,153,0.07)",
      "plpd-border-alert-success": "rgba(52,211,153,0.28)",
      "plpd-fill-alert-error": "rgba(244,112,124,0.07)",
      "plpd-border-alert-error": "rgba(244,112,124,0.28)",
    };

    for (const [name, value] of Object.entries(expected)) {
      expect(tokens.get(name), `--${name}`).toBe(value);
    }
  });

  it("centralizes exact gradients, shadows, mesh, and Tailwind exposure", () => {
    const tokens = rootTokens();

    expect(tokens.get("plpd-gradient-action-blue")).toBe(
      "linear-gradient(149.7deg,#2452970%,#0a2e63100%)",
    );
    expect(tokens.get("plpd-gradient-dropdown")).toBe(
      "linear-gradient(144.79deg,#2452970%,#0a2e63100%)",
    );
    expect(tokens.get("plpd-gradient-highlight")).toBe(
      "linear-gradient(154.81deg,#4071ba0%,#204b8c100%)",
    );
    expect(tokens.get("plpd-shadow-panel")).toBe(
      "0001pxrgba(7,9,18,0.3),018px30pxrgba(0,0,0,0.28)",
    );

    const mesh = tokens.get("plpd-mesh-image");
    expect(mesh).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(mesh).toContain("%3csvg%20width%3d%222364%22%20height%3d%222589%22");
    expect(css).toContain("background-image: var(--plpd-mesh-image)");
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
    expect(layout).toContain('weight: ["400", "500", "600", "700", "900"]');
    expect(layout).toContain('weight: ["400", "500", "600", "700", "800"]');
  });
});
