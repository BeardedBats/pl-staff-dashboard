import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiError,
  errorResponse,
  parseJsonBody,
  parseSearchParams,
} from "./http";

const schema = z.object({
  title: z.string().trim().min(1),
  count: z.number().int().positive(),
});

describe("API HTTP contracts", () => {
  it("returns parsed and normalized JSON", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "  Ready  ", count: 2 }),
    });

    await expect(parseJsonBody(request, schema)).resolves.toEqual({
      ok: true,
      data: { title: "Ready", count: 2 },
    });
  });

  it("distinguishes malformed JSON from schema validation", async () => {
    const malformed = new Request("https://example.test/api", {
      method: "POST",
      body: "{",
    });
    const malformedResult = await parseJsonBody(malformed, schema);
    expect(malformedResult.ok).toBe(false);
    if (!malformedResult.ok) {
      expect(malformedResult.response.status).toBe(400);
      await expect(malformedResult.response.json()).resolves.toEqual({
        error: "Invalid JSON body",
        code: "INVALID_JSON",
      });
    }

    const invalid = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", count: -1 }),
    });
    const invalidResult = await parseJsonBody(invalid, schema);
    expect(invalidResult.ok).toBe(false);
    if (!invalidResult.ok) {
      const body = await invalidResult.response.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "title" }),
          expect.objectContaining({ path: "count" }),
        ]),
      );
    }
  });

  it("allows an explicitly optional empty JSON body", async () => {
    const optionalSchema = z.object({
      mode: z.string().optional().default("standard"),
    });
    const request = new Request("https://example.test/api", {
      method: "POST",
    });
    await expect(
      parseJsonBody(request, optionalSchema, { allowEmpty: true }),
    ).resolves.toEqual({ ok: true, data: { mode: "standard" } });
  });

  it("keeps a stable backward-compatible error envelope", async () => {
    const response = apiError(403, "FORBIDDEN", "Forbidden");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
  });

  it("maps HTTP status to a stable default code", async () => {
    const response = errorResponse(502, "WordPress request failed");
    await expect(response.json()).resolves.toEqual({
      error: "WordPress request failed",
      code: "UPSTREAM_ERROR",
    });
  });

  it("validates and coerces URL search parameters", () => {
    const request = new Request(
      "https://example.test/api?site=pl&limit=25",
    );
    expect(
      parseSearchParams(
        request,
        z.object({
          site: z.enum(["pl", "qb"]),
          limit: z.coerce.number().int().min(1).max(200),
        }),
      ),
    ).toEqual({ ok: true, data: { site: "pl", limit: 25 } });
  });
});
