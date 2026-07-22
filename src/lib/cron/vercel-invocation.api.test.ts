import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/cron/execution", () => ({
  executeCronJob: mocks.execute,
}));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

import { GET as categorySync } from "@/app/api/cron/category-sync/route";
import { GET as deadlineReminders } from "@/app/api/cron/deadline-reminders/route";
import { GET as ga4Sync } from "@/app/api/cron/ga4-sync/route";
import { GET as profileSync } from "@/app/api/cron/profile-sync/route";
import { GET as raptiveSync } from "@/app/api/cron/raptive-sync/route";
import {
  GET as recurringGenerate,
  POST as recurringGenerateManual,
} from "@/app/api/cron/recurring-generate/route";
import { GET as seasonSwitch } from "@/app/api/cron/season-switch/route";
import { GET as unclaimedAlerts } from "@/app/api/cron/unclaimed-alerts/route";
import { GET as wpSync } from "@/app/api/cron/wp-sync/route";
import { CRON_JOBS } from "@/lib/cron/jobs";

type VercelConfig = { crons: Array<{ path: string; schedule: string }> };
type CronHandler = (request: Request) => Promise<Response>;

const config = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
) as VercelConfig;

const routes: Record<
  string,
  { handler: CronHandler; name: string; intervalSeconds: number }
> = {
  "/api/cron/category-sync": {
    handler: categorySync,
    ...CRON_JOBS["category-sync"].execution,
  },
  "/api/cron/deadline-reminders": {
    handler: deadlineReminders,
    ...CRON_JOBS["deadline-reminders"].execution,
  },
  "/api/cron/ga4-sync": {
    handler: ga4Sync,
    ...CRON_JOBS["ga4-sync"].execution,
  },
  "/api/cron/profile-sync": {
    handler: profileSync,
    ...CRON_JOBS["profile-sync"].execution,
  },
  "/api/cron/raptive-sync": {
    handler: raptiveSync,
    ...CRON_JOBS["raptive-sync"].execution,
  },
  "/api/cron/recurring-generate": {
    handler: recurringGenerate,
    ...CRON_JOBS["recurring-generate"].execution,
  },
  "/api/cron/season-switch": {
    handler: seasonSwitch,
    ...CRON_JOBS["season-switch"].execution,
  },
  "/api/cron/unclaimed-alerts": {
    handler: unclaimedAlerts,
    ...CRON_JOBS["unclaimed-alerts"].execution,
  },
  "/api/cron/wp-sync": {
    handler: wpSync,
    ...CRON_JOBS["wp-sync"].execution,
  },
};

function vercelRequest(pathname: string, schedule: string, secret: string) {
  return new Request(`https://dashboard.example.test${pathname}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "User-Agent": "vercel-cron/1.0",
      "x-vercel-cron-schedule": schedule,
    },
  });
}

describe("Vercel-shaped cron invocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.execute.mockImplementation(
      async (source: string, definition: { name: string; intervalSeconds: number }) =>
        Response.json({ source, definition }),
    );
  });

  it("maps every committed Vercel cron to one executable route contract", () => {
    expect(Object.keys(routes).sort()).toEqual(
      config.crons.map((cron) => cron.path).sort(),
    );
  });

  it("keeps the health registry synchronized with the deployed paths and schedules", () => {
    expect(
      Object.values(CRON_JOBS)
        .map(({ path: pathname, schedule }) => ({ path: pathname, schedule }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    ).toEqual([...config.crons].sort((a, b) => a.path.localeCompare(b.path)));
  });

  it("keeps every committed schedule within Vercel's supported syntax", () => {
    for (const { schedule } of config.crons) {
      const fields = schedule.trim().split(/\s+/);
      expect(fields).toHaveLength(5);
      expect(schedule).not.toMatch(/[A-Za-z]/);
      const dayOfMonth = fields[2];
      const dayOfWeek = fields[4];
      expect(dayOfMonth === "*" || dayOfWeek === "*").toBe(true);
    }
  });

  it.each(config.crons)(
    "$path accepts the production GET, user agent, schedule, and bearer headers",
    async ({ path: pathname, schedule }) => {
      const route = routes[pathname];
      const response = await route.handler(
        vercelRequest(
          pathname,
          schedule,
          "test-cron-secret-at-least-16-characters",
        ),
      );

      expect(response.status).toBe(200);
      expect(mocks.execute).toHaveBeenCalledWith(
        "vercel",
        { name: route.name, intervalSeconds: route.intervalSeconds },
        expect.any(Function),
      );
      expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    },
  );

  it.each(config.crons)(
    "$path rejects Vercel-shaped headers with a near-miss secret",
    async ({ path: pathname, schedule }) => {
      const response = await routes[pathname].handler(
        vercelRequest(pathname, schedule, "wrong-secret-at-least-16-characters"),
      );

      expect(response.status).toBe(401);
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );

  it("keeps interactive POST separate as a both-site admin invocation", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "admin-1",
      wp_user_id: 1,
      wp_site: "both",
      email: "admin@example.test",
      display_name: "Admin",
      avatar_url: null,
      bio: null,
      timezone: "UTC",
      theme: "dark",
      can_publish: true,
      onboarding_completed: true,
      roles: ["admin"],
      role_rows: [{ role: "admin", site: "both" }],
      session_id: "session-1",
    });

    const response = await recurringGenerateManual(
      new Request(
        "https://dashboard.example.test/api/cron/recurring-generate",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(
      "manual",
      { name: "recurring-generate", intervalSeconds: 24 * 60 * 60 },
      expect.any(Function),
    );
  });
});
