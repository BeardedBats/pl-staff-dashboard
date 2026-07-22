import { describe, expect, it } from "vitest";
import { bulkEntryUpdateSchema } from "./bulk-mutations";
import {
  bulkCreateEntriesSchema,
  createEntrySchema,
} from "./mutations";

const entryId = "80000000-0000-4000-8000-000000000001";
const secondEntryId = "80000000-0000-4000-8000-000000000002";
const tierId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";

function createInput(title: string) {
  return {
    title,
    site: "pl" as const,
    tier_id: tierId,
  };
}

describe("bulk create validation", () => {
  it("accepts a batch of 1 to 25 validated entries", () => {
    expect(
      bulkCreateEntriesSchema.safeParse({
        entries: [createInput("One"), createInput("Two")],
      }).success,
    ).toBe(true);
  });

  it("rejects more than 25 entries before the RPC", () => {
    expect(
      bulkCreateEntriesSchema.safeParse({
        entries: Array.from({ length: 26 }, (_, index) =>
          createInput(`Entry ${index}`),
        ),
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate assignees before the transaction", () => {
    expect(
      createEntrySchema.safeParse({
        ...createInput("Duplicate assignee"),
        assignee_user_ids: [userId, userId],
      }).success,
    ).toBe(false);
  });
});

describe("bulk update validation", () => {
  it("accepts each supported action contract", () => {
    const inputs = [
      { action: "archive", entry_ids: [entryId], reason: "Done" },
      { action: "unarchive", entry_ids: [entryId] },
      { action: "set_priority", entry_ids: [entryId], priority: true },
      { action: "change_tier", entry_ids: [entryId], tier_id: tierId },
    ];

    for (const input of inputs) {
      expect(bulkEntryUpdateSchema.safeParse(input).success).toBe(true);
    }
  });

  it("rejects duplicate entry IDs instead of silently changing counts", () => {
    expect(
      bulkEntryUpdateSchema.safeParse({
        action: "archive",
        entry_ids: [entryId, entryId],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 200 targets", () => {
    const entryIds = Array.from(
      { length: 201 },
      (_, index) =>
        `${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    entryIds[0] = entryId;
    entryIds[1] = secondEntryId;

    expect(
      bulkEntryUpdateSchema.safeParse({
        action: "set_priority",
        entry_ids: entryIds,
        priority: false,
      }).success,
    ).toBe(false);
  });
});
