import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  loadAuthorization: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  setFeatured: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/auth/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/authorization")>()),
  loadEntryAuthorizationContext: mocks.loadAuthorization,
  canUploadOrSubmitGraphicResource: () => true,
  isAdminPlusForSite: () => false,
}));
vi.mock("./storage", () => ({ downloadGraphicBytes: mocks.download }));
vi.mock("./wp-media", () => ({
  uploadMediaToWp: mocks.upload,
  setFeaturedMedia: mocks.setFeatured,
}));
vi.mock("@/lib/entries/status-transitions", () => ({
  writeAuditRow: mocks.audit,
}));
vi.mock("@/lib/notifications/trigger", () => ({
  triggerGraphicSubmitted: mocks.notify,
}));

import { submitGraphicRequest } from "./submit-flow";

const viewer: CurrentUser = {
  id: "artist-1",
  wp_user_id: 1,
  wp_site: "pl",
  email: "artist@example.test",
  display_name: "Artist",
  avatar_url: null,
  bio: null,
  timezone: "UTC",
  theme: "dark",
  can_publish: false,
  onboarding_completed: true,
  roles: ["graphics"],
  role_rows: [{ role: "graphics", site: "pl" }],
  session_id: "session-1",
};

const lease = {
  lease_token: "lease-1",
  leased_entry_id: "entry-1",
  leased_storage_path: "entry-1/v2.png",
  leased_file_name: "v2.png",
  leased_mime_type: "image/png",
  existing_wp_media_id: null as number | null,
  graphic_title: "Hero",
};

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: result }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

function arrangeReads() {
  const entryReads = [
    { id: "entry-1", site: "pl", wp_post_id: 99, wp_post_url: null },
    { title: "Entry title" },
  ];
  mocks.from.mockImplementation((table: string) =>
    table === "graphic_requests"
      ? query({ id: "request-1", entry_id: "entry-1", claimed_by: "artist-1" })
      : query(entryReads.shift() ?? null),
  );
  mocks.loadAuthorization.mockResolvedValue({ site: "pl" });
}

function arrangeRpc(options?: {
  beginError?: { code: string };
  existingMediaId?: number;
  recordError?: boolean;
  completeError?: boolean;
}) {
  mocks.rpc.mockImplementation((name: string) => {
    if (name === "begin_graphic_submission") {
      return {
        single: vi.fn().mockResolvedValue({
          data: options?.beginError
            ? null
            : {
                ...lease,
                existing_wp_media_id: options?.existingMediaId ?? null,
              },
          error: options?.beginError ?? null,
        }),
      };
    }
    if (name === "record_graphic_wp_media") {
      return Promise.resolve({ error: options?.recordError ? {} : null });
    }
    if (name === "complete_graphic_submission") {
      return Promise.resolve({
        data: options?.completeError ? null : options?.existingMediaId ?? 42,
        error: options?.completeError ? {} : null,
      });
    }
    return Promise.resolve({ data: true, error: null });
  });
}

describe("graphic submission orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    arrangeReads();
    mocks.download.mockResolvedValue({ ok: true, bytes: new ArrayBuffer(8) });
    mocks.upload.mockResolvedValue({
      ok: true,
      media: { mediaId: 42, sourceUrl: "https://wp/media/42" },
    });
    mocks.setFeatured.mockResolvedValue({ ok: true });
  });

  it("returns a lease collision without any WordPress side effect", async () => {
    arrangeRpc({ beginError: { code: "P0001" } });

    await expect(submitGraphicRequest(viewer, "request-1")).resolves.toEqual({
      ok: false,
      kind: "conflict",
      error: "This graphic is not ready to submit or is already being submitted",
    });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.setFeatured).not.toHaveBeenCalled();
  });

  it("reuses checkpointed WordPress media on retry", async () => {
    arrangeRpc({ existingMediaId: 77 });

    await expect(submitGraphicRequest(viewer, "request-1")).resolves.toEqual({
      ok: true,
      wp_media_id: 77,
    });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.setFeatured).toHaveBeenCalledWith("pl", 99, 77);
    expect(mocks.notify).toHaveBeenCalledOnce();
  });

  it("checkpoints a new media ID before setting it as featured", async () => {
    arrangeRpc();

    await expect(submitGraphicRequest(viewer, "request-1")).resolves.toEqual({
      ok: true,
      wp_media_id: 42,
    });
    const recordCall = mocks.rpc.mock.calls.findIndex(
      ([name]) => name === "record_graphic_wp_media",
    );
    const completeCall = mocks.rpc.mock.calls.findIndex(
      ([name]) => name === "complete_graphic_submission",
    );
    expect(recordCall).toBeGreaterThan(-1);
    expect(completeCall).toBeGreaterThan(recordCall);
    expect(mocks.setFeatured).toHaveBeenCalledWith("pl", 99, 42);
  });

  it("releases the lease and records a safe audit when WordPress fails", async () => {
    arrangeRpc();
    mocks.setFeatured.mockResolvedValue({
      ok: false,
      error: "WordPress featured-image update failed (503)",
    });

    await expect(submitGraphicRequest(viewer, "request-1")).resolves.toEqual({
      ok: false,
      kind: "upstream",
      error: "WordPress featured-image update failed (503)",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("release_graphic_submission", {
      p_request_id: "request-1",
      p_submission_token: "lease-1",
    });
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("releases the lease and suppresses notification on final DB failure", async () => {
    arrangeRpc({ completeError: true });

    await expect(submitGraphicRequest(viewer, "request-1")).resolves.toEqual({
      ok: false,
      kind: "database",
      error: "DB update failed after WordPress push",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("release_graphic_submission", {
      p_request_id: "request-1",
      p_submission_token: "lease-1",
    });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
