import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type VercelConfig = { crons: Array<{ path: string; schedule: string }> };

const config = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
) as VercelConfig;

describe("configured Vercel cron routes", () => {
  it.each(config.crons)("$path accepts Vercel GET and manual POST", ({ path: urlPath }) => {
    const sourcePath = path.join(process.cwd(), "src/app", urlPath, "route.ts");
    const source = fs.readFileSync(sourcePath, "utf8");
    expect(source).toMatch(/export\s*\{\s*handle as GET,\s*handle as POST\s*\}/);
    expect(source).toContain("authorizeCronRequest(request)");
  });
});
