import { describe, expect, it } from "vitest";
import { setupItemsForRoles } from "./setup";

describe("setupItemsForRoles", () => {
  it("keeps profile setup and adds the user's role workflow", () => {
    expect(setupItemsForRoles(["writer"]).map((item) => item.id)).toEqual([
      "profile",
      "writer-work",
    ]);
  });

  it("prioritizes operational responsibilities for multi-role users", () => {
    expect(
      setupItemsForRoles(["writer", "editor", "admin", "operations"]).map(
        (item) => item.id,
      ),
    ).toEqual(["profile", "operations-health", "admin-staff", "editor-queue"]);
  });
});
