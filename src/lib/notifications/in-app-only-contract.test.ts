import { describe, expect, it } from "vitest";
import { buildDefaultPreferences, NOTIFICATION_EVENT_TYPES } from "./defaults";
import { updatePreferencesSchema } from "./data";

describe("in-app-only notification contract", () => {
  it("exposes one real delivery channel in every default", () => {
    const preferences = buildDefaultPreferences([
      "writer",
      "editor",
      "graphics",
      "manager",
      "admin",
      "eic",
      "operations",
    ]);

    for (const type of NOTIFICATION_EVENT_TYPES) {
      expect(Object.keys(preferences[type])).toEqual(["in_app_enabled"]);
      expect(preferences[type].in_app_enabled).toBeTypeOf("boolean");
    }
  });

  it("rejects payloads that claim unsupported external channels", () => {
    const preference = {
      event_type: "mention",
      in_app_enabled: true,
    } as const;
    const delivery_settings = {
      mode: "immediate",
      digest_time: "09:00",
      quiet_hours_start: null,
      quiet_hours_end: null,
    } as const;

    expect(
      updatePreferencesSchema.safeParse({ preferences: [preference], delivery_settings }).success,
    ).toBe(true);
    expect(
      updatePreferencesSchema.safeParse({
        preferences: [{ ...preference, discord_enabled: true }],
        delivery_settings,
      }).success,
    ).toBe(false);
    expect(
      updatePreferencesSchema.safeParse({
        preferences: [{ ...preference, email_enabled: true }],
        delivery_settings,
      }).success,
    ).toBe(false);
  });
});
