import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sourceRoot = path.join(root, "src");

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(resolved);
    return entry.name.endsWith(".tsx") ? [resolved] : [];
  });
}

describe("PLPD table and data-value contract", () => {
  it("routes every literal application table through one shared construction", () => {
    const literalTables = tsxFiles(sourceRoot)
      .filter((file) => !file.endsWith(path.join("components", "ui", "table.tsx")))
      .map((file) => ({ file, content: readFileSync(file, "utf8") }))
      .filter(({ content }) => content.includes("<table"));

    expect(literalTables).toHaveLength(10);
    expect(
      literalTables.reduce(
        (count, { content }) => count + (content.match(/<table/g)?.length ?? 0),
        0,
      ),
    ).toBe(12);

    for (const { file, content } of literalTables) {
      const relative = path.relative(root, file);
      for (const table of content.matchAll(/<table[\s\S]*?>/g)) {
        expect(table[0], relative).toContain("plpd-table");
      }
      expect(content, relative).toContain("plpd-table-shell");
    }
  });

  it("pins exact header, row, hover, alignment, zero, and state rules", () => {
    const css = source("src/app/globals.css");

    for (const rule of [
      "--plpd-fill-table-header: #2E3658",
      "--plpd-table-header-height: 34.5px",
      "--plpd-table-row-height: 62px",
      "--plpd-duration-row-hover: 120ms",
      "background: var(--row-a)",
      "background: var(--row-b)",
      "background: var(--plpd-fill-row-hover)",
      "transition: background-color var(--plpd-duration-row-hover)",
      '[data-numeric="true"]',
      '[data-zero="true"]',
      '[data-row-state="bench"]',
      '[data-row-state="injured"]',
      '[data-row-state="best"]',
      'font-size: 16px',
      'font-size: 14px',
      "text-align: right",
      "font-variant-numeric: tabular-nums",
    ]) {
      expect(css, rule).toContain(rule);
    }
    const rowStateRules = [
      ...css.matchAll(/\.plpd-table[^{}]*data-row-state[^{}]*\{([^}]*)\}/g),
    ];
    expect(rowStateRules.length).toBeGreaterThan(0);
    for (const [, declarations] of rowStateRules) {
      expect(declarations).not.toContain("opacity");
    }
  });

  it("keeps zero and signed-delta colors distinct from semantic chips", () => {
    const css = source("src/app/globals.css");
    const table = source("src/components/ui/table.tsx");

    expect(css).toContain('--val-pos: #7fc8a9');
    expect(css).toContain('--val-neg: #d98f97');
    expect(css).toContain('data-value-tone="positive"');
    expect(css).toContain('data-value-tone="negative"');
    expect(css).toContain('data-value-tone="zero"');
    expect(table).toContain('value === 0');
    expect(table).toContain('delta && value !== null');
  });

  it("marks every currently numeric table family and its literal zeros", () => {
    const entries = source("src/components/entries/entries-table.tsx");
    const articles = source(
      "src/app/(app)/analytics/analytics-articles-tab.tsx",
    );
    const writers = source(
      "src/app/(app)/analytics/analytics-writers-tab.tsx",
    );
    const imports = source(
      "src/app/(app)/settings/admin-analytics-panel.tsx",
    );

    expect(entries).toContain("NUMERIC_COLUMN_IDS");
    for (const [file, content] of [
      ["articles", articles],
      ["writers", writers],
      ["imports", imports],
    ]) {
      expect(content, file).toContain('data-numeric="true"');
      expect(content, file).toContain("data-zero={");
    }
    expect(articles).not.toMatch(/tabular-nums[^"\n]*text-amber/);
    expect(writers).not.toMatch(/tabular-nums[^"\n]*text-amber/);
  });

  it("uses the exact disabled-aware chevron pagination construction", () => {
    const css = source("src/app/globals.css");
    const pagination = source("src/components/ui/pagination.tsx");
    const archive = source("src/app/(app)/archive/page.tsx");

    expect(css).toContain("width: 32px");
    expect(css).toContain("height: 32px");
    expect(css).toContain("filter: brightness(1.2)");
    expect(css).toContain("opacity: 0.4");
    expect(pagination).toContain("gap-3.5");
    expect(pagination).toContain("ChevronLeft");
    expect(pagination).toContain("ChevronRight");
    expect(archive).toContain("const PAGE_SIZE = 25");
    expect(archive).toContain("<Pagination");
    expect(archive).not.toContain("← Previous");
  });

  it("documents the verified visual authority and accessibility override", () => {
    const documentation = source("docs/PLPD_TABLES.md");

    expect(documentation).toContain(
      "DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B",
    );
    expect(documentation).toContain("--text-zero-accessible");
    expect(documentation).toContain("saturated chip green/red are not used");
  });
});
