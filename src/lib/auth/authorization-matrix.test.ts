import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const METHODS = "GET|POST|PATCH|DELETE|PUT";

function sourceHandlers(): string[] {
  const appRoot = path.join(process.cwd(), "src", "app");
  const apiRoot = path.join(appRoot, "api");
  const handlers = new Set<string>();

  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (entry.name !== "route.ts") continue;

      const route = `/${path
        .relative(appRoot, path.dirname(full))
        .split(path.sep)
        .join("/")}`;
      const source = fs.readFileSync(full, "utf8");
      for (const match of source.matchAll(
        new RegExp(`export\\s+async\\s+function\\s+(${METHODS})\\b`, "g"),
      )) {
        handlers.add(`${match[1]} ${route}`);
      }
      for (const match of source.matchAll(
        new RegExp(`\\bas\\s+(${METHODS})\\b`, "g"),
      )) {
        handlers.add(`${match[1]} ${route}`);
      }
    }
  };

  visit(apiRoot);
  return [...handlers].sort();
}

function documentedHandlers(document: string): string[] {
  const handlers = new Set<string>();
  const rows = document.matchAll(
    new RegExp(
      "^\\| (" +
        METHODS +
        ")(?: [^|]+)? \\| `([^`]+)` \\|",
      "gm",
    ),
  );
  for (const row of rows) handlers.add(`${row[1]} ${row[2]}`);
  return [...handlers].sort();
}

describe("authorization matrix coverage", () => {
  it("accounts for every exported API handler exactly once by method and path", () => {
    const document = fs.readFileSync(
      path.join(process.cwd(), "docs", "AUTHORIZATION_MATRIX.md"),
      "utf8",
    );
    const source = sourceHandlers();

    expect(documentedHandlers(document)).toEqual(source);
    expect(document).toContain(`Scope: all ${source.length} exported HTTP handlers`);
  });
});
