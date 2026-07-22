import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./normalization";

describe("normalizeEmail", () => {
  it("trims and lowercases identity input", () => {
    expect(normalizeEmail("  Editor+QB@Example.COM \n")).toBe(
      "editor+qb@example.com",
    );
  });
});
