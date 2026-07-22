import { describe, expect, it } from "vitest";
import { evaluateCronHealth, evaluateTimestampFreshness } from "./health-model";

const now = new Date("2026-07-21T20:00:00.000Z");

describe("operational health evaluation", () => {
  it("classifies missing, failed, stuck, stale, and current cron runs", () => {
    const health = evaluateCronHealth(
      [
        {
          job_name: "wp-sync",
          status: "succeeded",
          started_at: "2026-07-21T19:58:00.000Z",
          finished_at: "2026-07-21T19:59:00.000Z",
          lease_expires_at: "2026-07-21T20:13:00.000Z",
          error_code: null,
          attempt: 1,
        },
        {
          job_name: "ga4-sync",
          status: "failed",
          started_at: "2026-07-21T07:47:00.000Z",
          finished_at: "2026-07-21T07:48:00.000Z",
          lease_expires_at: "2026-07-21T08:02:00.000Z",
          error_code: "http_502",
          attempt: 2,
        },
        {
          job_name: "deadline-reminders",
          status: "running",
          started_at: "2026-07-21T18:00:00.000Z",
          finished_at: null,
          lease_expires_at: "2026-07-21T18:15:00.000Z",
          error_code: null,
          attempt: 1,
        },
        {
          job_name: "profile-sync",
          status: "succeeded",
          started_at: "2026-07-20T00:00:00.000Z",
          finished_at: "2026-07-20T00:01:00.000Z",
          lease_expires_at: "2026-07-20T00:15:00.000Z",
          error_code: null,
          attempt: 1,
        },
      ],
      now,
    );

    expect(health.find((item) => item.key === "wp-sync")?.level).toBe("healthy");
    expect(health.find((item) => item.key === "ga4-sync")).toMatchObject({
      level: "critical",
      errorCode: "http_502",
    });
    expect(health.find((item) => item.key === "deadline-reminders")?.level).toBe("critical");
    expect(health.find((item) => item.key === "profile-sync")?.level).toBe("warning");
    expect(health.find((item) => item.key === "category-sync")?.level).toBe("warning");
  });

  it("uses explicit freshness windows and rejects invalid timestamps", () => {
    expect(
      evaluateTimestampFreshness("2026-07-21T19:55:00.000Z", 900, now).level,
    ).toBe("healthy");
    expect(
      evaluateTimestampFreshness("2026-07-21T18:00:00.000Z", 900, now).level,
    ).toBe("warning");
    expect(evaluateTimestampFreshness("not-a-date", 900, now).level).toBe("critical");
    expect(evaluateTimestampFreshness(null, 900, now).level).toBe("warning");
  });
});
