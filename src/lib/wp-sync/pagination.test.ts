import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllWpPages } from "./pagination";

describe("fetchAllWpPages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns one complete snapshot across every advertised page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([{ id: 1 }], {
          headers: { "x-wp-totalpages": "2" },
        }),
      )
      .mockResolvedValueOnce(Response.json([{ id: 2 }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchAllWpPages<{ id: number }>({
        urlForPage: (page) => `https://example.test/items?page=${page}`,
        headers: { Accept: "application/json" },
      }),
    ).resolves.toEqual({ ok: true, rows: [{ id: 1 }, { id: 2 }] });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.test/items?page=2",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("discards partial rows when a later page fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json([{ id: 1 }], {
            headers: { "x-wp-totalpages": "2" },
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 503 })),
    );

    await expect(
      fetchAllWpPages<{ id: number }>({
        urlForPage: (page) => `https://example.test/items?page=${page}`,
        headers: {},
      }),
    ).resolves.toEqual({ ok: false, error: "WP returned 503" });
  });

  it("turns network and invalid-body failures into safe retryable errors", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket detail"))
      .mockResolvedValueOnce(new Response("not-json"));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      urlForPage: () => "https://example.test/items",
      headers: {},
    };

    await expect(fetchAllWpPages(input)).resolves.toEqual({
      ok: false,
      error: "Could not reach WordPress",
    });
    await expect(fetchAllWpPages(input)).resolves.toEqual({
      ok: false,
      error: "WordPress returned an invalid response",
    });
  });
});
