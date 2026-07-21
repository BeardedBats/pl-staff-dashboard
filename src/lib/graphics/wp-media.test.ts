import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/wordpress/config", () => ({
  getWordPressSiteConfig: () => ({
    url: "https://wp.example.test",
    appUsername: "media-user",
    appPassword: "media-password",
  }),
  wordPressBasicAuth: () => "Basic safe-token",
}));

import { setFeaturedMedia, uploadMediaToWp } from "./wp-media";

describe("WordPress graphic media boundary", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sanitizes the upload filename and validates the response shape", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 42, source_url: "https://wp/media/42" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      uploadMediaToWp("pl", {
        fileName: "../hero\"\r\nInjected.png",
        mimeType: "image/png",
        bytes: new ArrayBuffer(8),
      }),
    ).resolves.toEqual({
      ok: true,
      media: { mediaId: 42, sourceUrl: "https://wp/media/42" },
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const disposition = (init.headers as Record<string, string>)[
      "Content-Disposition"
    ];
    expect(disposition).toBe('attachment; filename="hero-Injected.png"');
    expect(disposition).not.toMatch(/[\r\n]/);
  });

  it.each([
    ["not JSON", new Response("not-json", { status: 201 })],
    [
      "missing a positive ID",
      new Response(JSON.stringify({ id: 0, source_url: "https://wp/media/0" }), {
        status: 201,
      }),
    ],
    [
      "missing a source URL",
      new Response(JSON.stringify({ id: 42 }), { status: 201 }),
    ],
  ])("rejects a media response %s", async (_label, response) => {
    fetchMock.mockResolvedValue(response);

    await expect(
      uploadMediaToWp("pl", {
        fileName: "hero.png",
        mimeType: "image/png",
        bytes: new ArrayBuffer(8),
      }),
    ).resolves.toEqual({
      ok: false,
      error: "WordPress returned an invalid media response",
    });
  });

  it("rejects invalid IDs without calling WordPress", async () => {
    await expect(setFeaturedMedia("pl", 0, 42)).resolves.toEqual({
      ok: false,
      error: "Invalid WordPress post or media ID",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sets the exact featured media ID", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(setFeaturedMedia("pl", 100, 42)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://wp.example.test/wp-json/wp/v2/posts/100",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ featured_media: 42 }),
      }),
    );
  });
});
