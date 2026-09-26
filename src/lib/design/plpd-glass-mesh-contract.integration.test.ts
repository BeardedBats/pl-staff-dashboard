import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    return statSync(absolute).isDirectory()
      ? sourceFiles(absolute)
      : /\.(?:css|tsx)$/.test(absolute) && !absolute.endsWith(".test.tsx")
        ? [absolute]
        : [];
  });
}

describe("PLPD subtle-glass-over-mesh contract", () => {
  it("preserves the exact source panel and translucent row fills", () => {
    expect(css).toContain("--plpd-fill-panel: var(--kel-glass-fill)");
    expect(css).toContain("--plpd-fill-state: var(--kel-input-fill)");
    expect(css).toContain("--row-a: rgba(47, 107, 224, .04)");
    expect(css).toContain("--row-b: transparent");
    expect(css.match(/--card: var\(--plpd-fill-panel\)/g)).toHaveLength(2);
  });

  it("keeps the exact mesh, transparent sidebar wash, and precise panel depth", () => {
    expect(css).toContain("background-image: var(--kel-header-fade), var(--kel-blue-wash), var(--plpd-mesh-image)");
    expect(css).toMatch(/\.plpd-sidebar\s*\{[\s\S]*?background: transparent;/);
    expect(css).toMatch(
      /\.plpd-sidebar::before\s*\{[\s\S]*?background: var\(--plpd-gradient-sidebar\);/,
    );
    expect(css).toMatch(
      /\.plpd-panel-frame\s*\{[\s\S]*?var\(--plpd-shadow-panel\), var\(--plpd-shadow-panel-inset\)/,
    );
  });

  it("keeps glass sharp without backdrop blur and uses an opaque mention menu", () => {
    const violations = sourceFiles(path.join(root, "src")).flatMap((file) =>
      /backdrop-blur|backdrop-filter:\\s*blur/.test(
        readFileSync(file, "utf8"),
      )
        ? [path.relative(root, file)]
        : [],
    );
    const composer = source("src/components/comments/comment-composer.tsx");
    const login = source("src/app/login/page.tsx");

    expect(violations).toEqual([]);
    expect(composer).toContain("plpd-dropdown-menu");
    expect(composer).not.toContain("bg-popover");
    expect(login).toContain("plpd-panel-frame");
    expect(login).not.toContain("shadow-lg");
  });

  it("documents source, derived-light, and ordinary shadow-blur boundaries", () => {
    const documentation = source("docs/PLPD_GLASS_MESH.md");

    expect(documentation).toContain(
      "DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B",
    );
    expect(documentation).toContain("rgba(33, 36, 58, 0.35)");
    expect(documentation).toContain("Frosted glass is prohibited");
    expect(documentation).toContain("filter: blur(13px)");
    expect(documentation).toContain("Derived light mode");
  });
});
