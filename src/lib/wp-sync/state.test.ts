import { describe, expect, it } from "vitest";
import { reconcilePublication } from "./state";
describe("WordPress publication reconciliation", () => {
  it("moves a changed schedule to the WordPress date", () => {
    expect(reconcilePublication("scheduled", "future", "2026-09-06T14:00:00Z").publication.publish_date)
      .toBe("2026-09-06T14:00:00Z");
  });
  it("clears publication when WordPress unpublishes", () => {
    expect(reconcilePublication("published", "draft", null)).toEqual({
      editorStatus: "edited", publication: { publish_date: null, publish_date_precision: "none", published_at: null },
    });
  });
  it("preserves in-progress editorial work", () => {
    expect(reconcilePublication("editing", "draft", null)).toEqual({ editorStatus: "editing", publication: {} });
  });
  it("does not store invalid dates", () => {
    expect(reconcilePublication("ready", "publish", "invalid").publication.publish_date).toBeNull();
  });
});
