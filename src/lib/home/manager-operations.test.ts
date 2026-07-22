import { describe, expect, it } from "vitest";
import { buildWeeklyOperationalDigest } from "./manager-operations";
import type { PipelineHealth } from "./widgets";

const health: PipelineHealth = {
  writerNeeded: 2,
  claimed: 4,
  submitted: 3,
  readyForEdit: 2,
  polishing: 1,
  scheduled: 5,
  publishedThisWeek: 8,
  drafted: 0,
  gateBlocked: 1,
};

describe("buildWeeklyOperationalDigest", () => {
  it("puts pending decisions ahead of pipeline risks", () => {
    expect(
      buildWeeklyOperationalDigest({
        health,
        signals: { overdue: 3, dueNextSevenDays: 6, stale: 1 },
        pendingApprovals: 2,
      }),
    ).toMatchObject({
      delivered: 8,
      committed: 6,
      decisions: 2,
      risks: 7,
      nextActionHref: "#manager-inbox",
    });
  });

  it("directs a clear pipeline to the forward calendar", () => {
    expect(
      buildWeeklyOperationalDigest({
        health: { ...health, writerNeeded: 0, gateBlocked: 0 },
        signals: { overdue: 0, dueNextSevenDays: 4, stale: 0 },
        pendingApprovals: 0,
      }).nextActionHref,
    ).toBe("/calendar");
  });
});
