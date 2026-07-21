import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({ upload: mocks.upload, remove: mocks.remove }),
    },
  }),
}));

import {
  buildStoragePath,
  deleteStoredGraphics,
  uploadGraphicFile,
  validateImageBytes,
} from "./storage";

function bytes(values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

describe("graphic storage behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
  });

  it.each([
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/jpeg", [0xff, 0xd8, 0xff]],
    ["image/gif", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    [
      "image/webp",
      [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    ],
  ])("accepts a real %s signature", (mimeType, signature) => {
    expect(validateImageBytes(bytes(signature as number[]), mimeType)).toBeNull();
  });

  it("rejects a spoofed MIME type before touching storage", async () => {
    const result = await uploadGraphicFile(
      "entry-1",
      "not-really.png",
      "image/png",
      bytes([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]),
    );

    expect(result).toEqual({
      ok: false,
      error: "File contents do not match the declared image type.",
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uses collision-resistant immutable paths even in the same millisecond", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const first = buildStoragePath("entry-1", "hero image.png");
    const second = buildStoragePath("entry-1", "hero image.png");

    expect(first).toMatch(/^entry-1\/1234-[0-9a-f-]+-hero-image\.png$/);
    expect(second).not.toBe(first);
  });

  it("deduplicates immutable paths in one storage cleanup call", async () => {
    await expect(
      deleteStoredGraphics(["entry/v1.png", "entry/v2.png", "entry/v1.png", ""]),
    ).resolves.toEqual({ ok: true });

    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledWith([
      "entry/v1.png",
      "entry/v2.png",
    ]);
  });
});
