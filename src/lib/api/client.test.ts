import { describe, expect, it } from "vitest";
import { readApiError } from "./client";

describe("API client errors", () => {
  it("reads the stable user-facing error field", async () => {
    const response = Response.json(
      { error: "That action is not available", code: "FORBIDDEN" },
      { status: 403 },
    );
    await expect(readApiError(response, "Action failed")).resolves.toBe(
      "That action is not available",
    );
  });

  it("does not surface raw HTML error pages", async () => {
    const response = new Response("<h1>proxy internals</h1>", { status: 502 });
    await expect(readApiError(response, "Action failed")).resolves.toBe(
      "Action failed",
    );
  });

  it("caps server messages before rendering", async () => {
    const response = Response.json({ error: "x".repeat(500) }, { status: 400 });
    const message = await readApiError(response, "Action failed");
    expect(message).toHaveLength(300);
  });
});
