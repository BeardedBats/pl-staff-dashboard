import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const srcRoot = path.join(root, "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    return statSync(absolute).isDirectory()
      ? sourceFiles(absolute)
      : absolute.endsWith(".tsx") && !absolute.endsWith(".test.tsx")
        ? [absolute]
        : [];
  });
}

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("PLPD typography contract", () => {
  it("loads both approved families and defaults application chrome to Inter", () => {
    const layout = source("src/app/layout.tsx");
    const css = source("src/app/globals.css");

    expect(layout).toContain("Instrument_Sans");
    expect(layout).toContain("Inter");
    expect(layout).toContain("font-sans");
    expect(css).toContain("--font-sans: var(--kel-font-body)");
    expect(css).toContain("--font-data: var(--kel-font-ui)");
  });

  it("reserves monospace for literal code elements", () => {
    const violations = sourceFiles(srcRoot).flatMap((file) =>
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .flatMap((line, index) =>
          line.includes("font-mono") && !line.includes("<code")
            ? [`${path.relative(root, file)}:${index + 1}`]
            : [],
        ),
    );

    expect(violations).toEqual([]);
  });

  it("keeps every literal data table on Instrument Sans", () => {
    const violations = sourceFiles(srcRoot).flatMap((file) => {
      const contents = readFileSync(file, "utf8");
      return [...contents.matchAll(/<table\b[^>]*className="([^"]*)"/g)]
        .filter(([, classes]) => !classes.split(/\s+/).includes("font-data"))
        .map((match) => `${path.relative(root, file)}:${match.index}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps standalone numerals and chart labels on Instrument Sans", () => {
    const numeralViolations = sourceFiles(srcRoot).flatMap((file) =>
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .flatMap((line, index) =>
          line.includes("tabular-nums") &&
          !line.includes("font-data") &&
          !line.includes("<td") &&
          !file.endsWith(`${path.sep}ui${path.sep}table.tsx`)
            ? [`${path.relative(root, file)}:${index + 1}`]
            : [],
        ),
    );
    const chartViolations = sourceFiles(srcRoot).flatMap((file) => {
      const contents = readFileSync(file, "utf8");
      return [
        ...contents.matchAll(
          /<div className="([^"]*)">\s*<ResponsiveContainer\b/g,
        ),
      ]
        .filter(([, classes]) => !classes.split(/\s+/).includes("font-data"))
        .map((match) => `${path.relative(root, file)}:${match.index}`);
    });

    expect(numeralViolations).toEqual([]);
    expect(chartViolations).toEqual([]);
  });

  it("keeps data-bearing site, tier, team, and category pills on Instrument Sans", () => {
    const dataPill = /(?:tier|site|team_name|team_site|category\.name)/i;
    const violations = sourceFiles(srcRoot).flatMap((file) => {
      const contents = readFileSync(file, "utf8");
      return [...contents.matchAll(/<Badge\b([^>]*)>([\s\S]*?)<\/Badge>/g)]
        .filter(([, , body]) => dataPill.test(body))
        .filter(([, attributes]) => !attributes.includes("font-data"))
        .map((match) => `${path.relative(root, file)}:${match.index}`);
    });

    expect(violations).toEqual([]);
  });

  it("pins chrome, data, and heavy-weight roles to the guide", () => {
    for (const file of [
      "src/components/ui/button.tsx",
      "src/components/ui/dialog.tsx",
      "src/components/ui/sheet.tsx",
    ]) {
      expect(source(file), file).toContain("font-sans");
    }

    for (const file of [
      "src/components/ui/page-header.tsx",
      "src/components/ui/dropdown-menu.tsx",
      "src/components/ui/pagination.tsx",
      "src/components/ui/table.tsx",
      "src/components/layout/sidebar.tsx",
    ]) {
      expect(source(file), file).toContain("font-data");
    }

    const css = source("src/app/globals.css");
    expect(css).toMatch(
      /\.plpd-section-title\s*\{[\s\S]*?font-family: var\(--font-data\);[\s\S]*?font-weight: var\(--plpd-weight-section\);/,
    );
    expect(css).toMatch(
      /\.plpd-hero-numeral\s*\{[\s\S]*?font-family: var\(--font-data\);[\s\S]*?font-weight: var\(--plpd-weight-hero\);/,
    );

    const freeFormHeavyWeights = sourceFiles(srcRoot).flatMap((file) =>
      /font-(?:black|extrabold|\[(?:800|900)\])/.test(
        readFileSync(file, "utf8"),
      )
        ? [path.relative(root, file)]
        : [],
    );
    expect(freeFormHeavyWeights).toEqual([]);
  });

  it("documents the verified authority and phase boundary", () => {
    const documentation = source("docs/PLPD_TYPOGRAPHY.md");

    expect(documentation).toContain(
      "DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B",
    );
    expect(documentation).toContain("font-sans");
    expect(documentation).toContain("font-data");
    expect(documentation).toContain("literal code");
    expect(documentation).toContain("P3.8");
  });
});
