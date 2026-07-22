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

function violations(pattern: RegExp) {
  return productionTsx(srcRoot).flatMap((file) => {
    const contents = readFileSync(file, "utf8");
    return pattern.test(contents) ? [path.relative(root, file)] : [];
  });
}

describe("PLPD Never List contract", () => {
  it("records all 16 prohibitions against the reviewed authority", () => {
    const documentation = source("docs/PLPD_NEVER_LIST.md");
    const rules = [
      "Opaque flat panels",
      "Frosted-blur glassmorphism",
      "Uniform heavy shadows",
      "Invented hex values",
      "DM Sans on table data / Work Sans on titles",
      "Italic meta lines",
      "LEAGUE:",
      "Centered numeric columns",
      "Full-brightness zeros",
      "Opacity-dimmed bench rows",
      "Pre as a column label",
      "Opponent matchup on the player line",
      "Cyan active tabs",
      "Borders instead of the Import shadow-ring",
      "Weights above 700 outside two exceptions",
      "Hidden CONFLICT states",
    ];

    expect(documentation).toContain(
      "DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B",
    );
    for (const rule of rules) expect(documentation, rule).toContain(rule);
  });

  it("prohibits opaque literals, frosted glass, and generic heavy shadows", () => {
    const css = source("src/app/globals.css");

    expect(violations(/\bbg-(?:white|black|slate|gray|zinc|neutral|stone)(?:\b|[-/])/)).toEqual([]);
    expect(violations(/\bshadow-(?:lg|xl|2xl)\b/)).toEqual([]);
    expect(violations(/#[0-9a-f]{3,8}|rgba?\(|(?:linear|radial)-gradient\(/i)).toEqual([]);
    expect(violations(/backdrop-(?:blur|filter)|backdrop-filter/)).toEqual([]);
    expect(css.match(/--card: var\(--plpd-fill-panel\)/g)).toHaveLength(2);
  });

  it("keeps titles, table data, metadata, and weight exceptions exact", () => {
    const files = productionTsx(srcRoot);
    const tableViolations = files.flatMap((file) => {
      const contents = readFileSync(file, "utf8");
      return [...contents.matchAll(/<table\b[^>]*className="([^"]*)"/g)]
        .filter(([, classes]) => !classes.split(/\s+/).includes("font-data"))
        .map(() => path.relative(root, file));
    });

    expect(tableViolations).toEqual([]);
    expect(violations(/<h[1-6]\b[^>]*className="[^"]*\bfont-data\b/)).toEqual([]);
    expect(violations(/\bitalic\b/)).toEqual([]);
    expect(violations(/font-(?:black|extrabold|\[(?:800|900)\])/)).toEqual([]);
  });

  it("prohibits forbidden table labels, alignment, zeros, and row opacity", () => {
    const css = source("src/app/globals.css");
    const tableSources = productionTsx(srcRoot)
      .map((file) => readFileSync(file, "utf8"))
      .filter((contents) => contents.includes("<table"))
      .join("\n");
    const rowStateRules = [
      ...css.matchAll(/\.plpd-table[^{}]*data-row-state[^{}]*\{([^}]*)\}/g),
    ];

    expect(tableSources).not.toMatch(/data-numeric="true"[^>]*\btext-center\b/);
    expect(tableSources).not.toMatch(/<th\b[^>]*>\s*Pre\s*<\/th>/i);
    expect(tableSources).not.toMatch(/\b(?:opponent|matchup)\b/i);
    expect(css).toContain('.plpd-table [data-zero="true"]');
    expect(css).toContain('.plpd-data-value[data-value-tone="zero"]');
    expect(rowStateRules.length).toBeGreaterThan(0);
    for (const [, declarations] of rowStateRules) {
      expect(declarations).not.toContain("opacity");
    }
  });

  it("keeps active tabs amber and Import actions on the four-layer ring", () => {
    const tabs = source("src/components/ui/tabs.tsx");
    const buttons = source("src/components/ui/button.tsx");
    const css = source("src/app/globals.css");

    expect(tabs).toContain("data-[state=active]:text-amber");
    expect(tabs).not.toMatch(/data-\[state=active\]:text-cyan/);
    expect(buttons).toContain('default: "plpd-btn-import');
    expect(buttons).toContain('amber: "plpd-btn-cta');
    expect(css).toMatch(/\.plpd-btn-import,[\s\S]*?border: none;[\s\S]*?var\(--plpd-shadow-action\)/);
    expect(css).toContain(".plpd-btn-import::before");
    expect(css).toContain(".plpd-btn-import::after");
  });

  it("keeps conflict-equivalent states visible and hover interactions non-fading", () => {
    const badges = source("src/components/entries/status-badges.tsx");

    expect(badges).toContain('polishing: "violet"');
    expect(badges).toContain('polishing: "Polishing"');
    expect(badges).toContain('flagged: "red"');
    expect(badges).toContain('flagged: "Flagged"');
    expect(badges).toContain('if (statuses.includes("flagged")) return "flagged"');
    expect(violations(/\bhover:opacity-(?!100\b)[^\s"]+/)).toEqual([]);
  });
});
