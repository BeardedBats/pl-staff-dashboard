import { describe, expect, it } from "vitest";
import { recipientsForSite } from "./recipients";

describe("recipientsForSite", () => {
  const rows = [
    { user_id: "pl-manager", site: "pl" as const },
    { user_id: "qb-manager", site: "qb" as const },
    { user_id: "both-manager", site: "both" as const },
    { user_id: "both-manager", site: "pl" as const },
  ];

  it("includes matching and both-site recipients without duplicates", () => {
    expect(recipientsForSite(rows, "pl")).toEqual([
      "pl-manager",
      "both-manager",
    ]);
  });

  it("excludes recipients assigned only to the other site", () => {
    expect(recipientsForSite(rows, "qb")).toEqual([
      "qb-manager",
      "both-manager",
    ]);
  });
});
