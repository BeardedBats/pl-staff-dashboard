import { describe, expect, it } from "vitest";
import { updateSeasonModeSchema } from "./data";

describe("season mode date validation", () => {
  it("accepts an open-ended season window", () => {
    expect(
      updateSeasonModeSchema.safeParse({
        auto_switch_start: "2026-04-13",
        auto_switch_end: null,
      }).success,
    ).toBe(true);
  });

  it("accepts an ordered closed window", () => {
    expect(
      updateSeasonModeSchema.safeParse({
        auto_switch_start: "2026-04-13",
        auto_switch_end: "2026-10-31",
      }).success,
    ).toBe(true);
  });

  it("rejects a start date after the end date", () => {
    const result = updateSeasonModeSchema.safeParse({
      auto_switch_start: "2026-10-31",
      auto_switch_end: "2026-04-13",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["auto_switch_end"],
        message: "Start date must be on or before end date",
      });
    }
  });
});
