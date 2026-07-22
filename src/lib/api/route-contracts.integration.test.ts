import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function routeFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.name === "route.ts" ? [fullPath] : [];
  });
}

describe("API route contracts", () => {
  const files = routeFiles(path.join(process.cwd(), "src", "app", "api"));
  const publicErrorBoundaryFiles = [
    "analytics/ga4.ts",
    "analytics/raptive.ts",
    "entries/wp-post.ts",
    "graphics/storage.ts",
    "graphics/wp-media.ts",
    "recurring-templates/generator.ts",
    "users/mutations.ts",
    "wp-sync/posts.ts",
    "wp-sync/profiles.ts",
  ].map((file) => path.join(process.cwd(), "src", "lib", file));

  it("routes every JSON body through the shared parser", () => {
    const directParsers = files.filter((file) =>
      fs.readFileSync(file, "utf8").includes("request.json("),
    );
    expect(directParsers).toEqual([]);
  });

  it("does not emit legacy one-off error envelopes", () => {
    const legacyErrors = files.filter((file) =>
      /NextResponse\.json\(\{ error:/.test(fs.readFileSync(file, "utf8")),
    );
    expect(legacyErrors).toEqual([]);
  });

  it("does not return raw exception or database messages", () => {
    const rawErrors = files.filter((file) =>
      /error\.message|err\.message/.test(fs.readFileSync(file, "utf8")),
    );
    expect(rawErrors).toEqual([]);
  });

  it("does not pass raw upstream bodies or helper-layer exception text to routes", () => {
    const unsafeBoundaries = publicErrorBoundaryFiles.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return (
        /(?:response|res)\.text\(/.test(source) ||
        /error:\s*(?:error|err|\w+Error)\??\.message/.test(source) ||
        /`[^`]*\$\{[^}]*\??\.message[^}]*\}[^`]*`/.test(source)
      );
    });
    expect(unsafeBoundaries).toEqual([]);
  });
});
