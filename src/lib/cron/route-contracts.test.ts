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
    expect(source).toContain("executeCronJob(authorized.source");
  });

  it("uses database-enforced per-recipient keys for both reminder jobs", () => {
    for (const file of [
      "src/app/api/cron/deadline-reminders/route.ts",
      "src/app/api/cron/unclaimed-alerts/route.ts",
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).toContain("dedupeKey:");
    }
    const dispatch = fs.readFileSync(
      path.join(process.cwd(), "src/lib/notifications/data.ts"),
      "utf8",
    );
    expect(dispatch).toContain('onConflict: "user_id,dedupe_key"');
    expect(dispatch).toContain("ignoreDuplicates: true");
  });
});
