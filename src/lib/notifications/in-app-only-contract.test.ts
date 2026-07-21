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

    expect(
      updatePreferencesSchema.safeParse({ preferences: [preference] }).success,
    ).toBe(true);
    expect(
      updatePreferencesSchema.safeParse({
        preferences: [{ ...preference, discord_enabled: true }],
      }).success,
    ).toBe(false);
    expect(
      updatePreferencesSchema.safeParse({
        preferences: [{ ...preference, email_enabled: true }],
      }).success,
    ).toBe(false);
  });
});
