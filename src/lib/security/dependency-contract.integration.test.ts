import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type PackageManifest = {
  dependencies: Record<string, string>;
  overrides: {
    next: Record<string, string>;
  };
};

type PackageLock = {
  packages: Record<
    string,
    {
      dependencies?: Record<string, string>;
      version?: string;
    }
  >;
};

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
) as PackageManifest;
const lock = JSON.parse(
  readFileSync(path.join(root, "package-lock.json"), "utf8"),
) as PackageLock;

describe("dependency security contract", () => {
  it("keeps Next.js current while forcing the patched Sharp release", () => {
    expect(manifest.dependencies.next).toBe("16.2.11");
    expect(manifest.overrides.next.sharp).toBe("0.35.3");

    expect(lock.packages[""].dependencies?.next).toBe("16.2.11");
    expect(lock.packages["node_modules/next"].version).toBe("16.2.11");
    expect(lock.packages["node_modules/sharp"].version).toBe("0.35.3");
  });
});
