import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SIGNED_URL_TTL_SECONDS,
  normalizeSignedUrlTtl,
  sanitizeFilename,
} from "./storage";

describe("private graphics storage contract", () => {
  it.each([
    [0, 1],
    [-100, 1],
    [1.9, 1],
    [60, 60],
    [SIGNED_URL_TTL_SECONDS + 1, SIGNED_URL_TTL_SECONDS],
    [Number.NaN, SIGNED_URL_TTL_SECONDS],
    [Number.POSITIVE_INFINITY, SIGNED_URL_TTL_SECONDS],
  ])("normalizes signed URL TTL %s", (input, expected) => {
    expect(normalizeSignedUrlTtl(input)).toBe(expected);
  });

  it("removes path traversal and unsafe filename characters", () => {
    expect(sanitizeFilename("../../Résumé <final>.png")).toBe(
      "Resume-final-.png",
    );
  });

  it("has no browser Supabase client or public-object URL call", () => {
    const srcRoot = path.join(process.cwd(), "src");
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          !entry.name.includes(".test.")
        ) {
          files.push(full);
        }
      }
    };
    visit(srcRoot);
    const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\bcreateBrowserClient\s*\(/);
    expect(source).not.toMatch(/\.getPublicUrl\s*\(/);
  });

  it("keeps service-role and signing modules server-only", () => {
    for (const file of [
      "src/lib/supabase/admin.ts",
      "src/lib/graphics/storage.ts",
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source.startsWith('import "server-only";')).toBe(true);
      expect(source).not.toContain('"use client"');
    }
  });
});
