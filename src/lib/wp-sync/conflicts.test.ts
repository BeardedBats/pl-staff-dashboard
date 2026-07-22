import { describe, expect, it } from "vitest";
import { decideTitleSync } from "./conflicts";

describe("WordPress title conflict detection", () => {
  it("establishes a baseline without inventing a conflict", () => {
    expect(
      decideTitleSync({
        dashboardTitle: "Dashboard title",
        lastSyncedTitle: null,
        wordPressTitle: "WordPress title",
      }),
    ).toEqual({ status: "synced", nextBaseline: "WordPress title" });
  });

  it("detects divergent edits from the same baseline", () => {
    expect(
      decideTitleSync({
        dashboardTitle: "Dashboard edit",
        lastSyncedTitle: "Original",
        wordPressTitle: "WordPress edit",
      }),
    ).toEqual({ status: "conflict", nextBaseline: "Original" });
  });

  it("accepts one-sided and matching edits", () => {
    expect(
      decideTitleSync({
        dashboardTitle: "Original",
        lastSyncedTitle: "Original",
        wordPressTitle: "WordPress edit",
      }).status,
    ).toBe("synced");
    expect(
      decideTitleSync({
        dashboardTitle: "Shared edit",
        lastSyncedTitle: "Original",
        wordPressTitle: "Shared edit",
      }).status,
    ).toBe("synced");
  });
});
