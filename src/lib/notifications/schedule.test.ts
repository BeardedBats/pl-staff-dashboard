import { describe, expect, it } from "vitest";
import { notificationAvailableAt, type NotificationDeliverySettings } from "./schedule";

const base: NotificationDeliverySettings = {
  mode: "immediate",
  digest_time: "09:00",
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: "UTC",
};

describe("notification delivery scheduling", () => {
  it("delivers immediate notifications without artificial delay", () => {
    const now = new Date("2026-07-21T14:25:00.000Z");
    expect(notificationAvailableAt(now, base)).toEqual(now);
  });

  it("holds immediate notifications until overnight quiet hours end", () => {
    const result = notificationAvailableAt(
      new Date("2026-07-21T23:30:00.000Z"),
      { ...base, quiet_hours_start: "22:00", quiet_hours_end: "07:00" },
    );
    expect(result.toISOString()).toBe("2026-07-22T07:00:00.000Z");
  });

  it("batches daily delivery at the next configured local time", () => {
    const result = notificationAvailableAt(
      new Date("2026-07-21T14:25:00.000Z"),
      { ...base, mode: "daily_digest", digest_time: "09:00" },
    );
    expect(result.toISOString()).toBe("2026-07-22T09:00:00.000Z");
  });

  it("honors a non-UTC staff timezone", () => {
    const result = notificationAvailableAt(
      new Date("2026-07-21T12:00:00.000Z"),
      {
        ...base,
        mode: "daily_digest",
        digest_time: "09:00",
        timezone: "America/New_York",
      },
    );
    expect(result.toISOString()).toBe("2026-07-21T13:00:00.000Z");
  });
});
