import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getGraphic: vi.fn(),
  loadAuthorization: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/graphics/data", () => ({
  getGraphicRequestById: mocks.getGraphic,
}));
vi.mock("@/lib/auth/authorization", () => ({
  loadEntryAuthorizationContext: mocks.loadAuthorization,
  canUploadOrSubmitGraphicResource: () => true,
  isAdminPlusForSite: () => false,
}));
vi.mock("@/lib/graphics/storage", () => ({
  uploadGraphicFile: mocks.upload,
  deleteStoredGraphic: mocks.remove,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}));

import { POST } from "./route";

function requestWithFile() {
  const form = new FormData();
  form.set("file", new File([Uint8Array.from([1, 2, 3])], "new.png", { type: "image/png" }));
  return new Request("http://localhost/api/graphic-requests/request-1/upload", {
    method: "POST",
    body: form,
  });
}

const context = { params: Promise.resolve({ id: "request-1" }) };

describe("graphic upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "artist-1" });
    mocks.getGraphic
      .mockResolvedValueOnce({
        id: "request-1",
        entry_id: "entry-1",
        claimed_by: "artist-1",
        graphic_status: "claimed",
        storage_path: "entry-1/old.png",
      })
      .mockResolvedValueOnce({ id: "request-1", storage_path: "entry-1/new.png" });
    mocks.loadAuthorization.mockResolvedValue({ site: "pl" });
    mocks.upload.mockResolvedValue({
      ok: true,
      file: {
        storagePath: "entry-1/new.png",
        fileName: "new.png",
        fileSize: 3,
        mimeType: "image/png",
      },
    });
  });

  it("records the new immutable version without deleting the prior object", async () => {
    mocks.rpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({ error: null }),
    });

    const response = await POST(requestWithFile(), context);

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_graphic_upload",
      expect.objectContaining({
        p_expected_storage_path: "entry-1/old.png",
        p_storage_path: "entry-1/new.png",
      }),
    );
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes only the new object when a concurrent upload wins", async () => {
    mocks.rpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({ error: { code: "P0001" } }),
    });

    const response = await POST(requestWithFile(), context);

    expect(response.status).toBe(409);
    expect(mocks.remove).toHaveBeenCalledWith("entry-1/new.png");
    expect(mocks.remove).not.toHaveBeenCalledWith("entry-1/old.png");
  });
});
