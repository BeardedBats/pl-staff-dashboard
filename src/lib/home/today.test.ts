import { describe, expect, it } from "vitest";
import type { HomeEntryCard } from "@/lib/home/widgets";
import { buildTodayBrief } from "./today";

const entry = (overrides: Partial<HomeEntryCard> = {}): HomeEntryCard => ({
  id: "entry-1",
  title: "Bullpen report",
  site: "pl",
  tier_name: "A",
  publish_date: null,
  content_status: "claimed",
  editor_status: "none",
  priority: false,
  wp_post_url: null,
  ...overrides,
});

const base = {
  pendingClaims: 0,
  pendingArchives: 0,
  myClaims: [] as HomeEntryCard[],
  myDeadlines: [] as HomeEntryCard[],
  myDrafts: [] as HomeEntryCard[],
  editorQueue: [] as HomeEntryCard[],
  myEdits: [] as HomeEntryCard[],
  openGraphics: [],
  myGraphics: [],
  pipelineHealth: null,
  staleEntries: [] as HomeEntryCard[],
  unclaimedSlots: [] as HomeEntryCard[],
  now: new Date("2026-07-21T16:00:00.000Z"),
};

describe("buildTodayBrief", () => {
  it("prioritizes team-blocking approvals over personal work", () => {
    const result = buildTodayBrief({
      ...base,
      pendingClaims: 1,
      myClaims: [entry({ publish_date: "2026-07-20T12:00:00.000Z" })],
    });

    expect(result).toMatchObject({
      state: "urgent",
      title: "1 approval blocking the team",
      href: "/home#manager-inbox",
    });
  });

  it("directs a writer to the oldest overdue assignment", () => {
    const result = buildTodayBrief({
      ...base,
      myClaims: [
        entry({ id: "oldest", publish_date: "2026-07-19T12:00:00.000Z" }),
        entry({ id: "newer", publish_date: "2026-07-20T12:00:00.000Z" }),
      ],
    });

    expect(result.href).toBe("/content?entry=oldest");
    expect(result.title).toContain("2 assignments");
  });

  it("offers capacity work only after owned queues are clear", () => {
    const result = buildTodayBrief({
      ...base,
      unclaimedSlots: [entry(), entry({ id: "entry-2" })],
    });

    expect(result).toMatchObject({
      state: "clear",
      actionLabel: "Browse open slots",
    });
  });
});
