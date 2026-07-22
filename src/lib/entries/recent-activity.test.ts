import { describe, expect, it } from "vitest";
import { latestPolishingFeedback, type RecentActivityEvent } from "./recent-activity";

const event = (
  label: string,
  type: RecentActivityEvent["type"] = "status_change",
): RecentActivityEvent => ({
  type,
  actor_id: "10000000-0000-4000-8000-000000000001",
  actor_name: "Editor",
  label,
  at: "2026-07-21T12:00:00.000Z",
});

describe("latestPolishingFeedback", () => {
  it("returns the newest actionable polishing request", () => {
    expect(
      latestPolishingFeedback([
        event("sent back for polishing: Clarify the conclusion."),
        event("sent back for polishing: Older request."),
      ]),
    ).toEqual({
      reason: "Clarify the conclusion.",
      actorName: "Editor",
      requestedAt: "2026-07-21T12:00:00.000Z",
    });
  });

  it("ignores unrelated activity", () => {
    expect(latestPolishingFeedback([event("added a comment", "comment")])).toBeNull();
  });
});
