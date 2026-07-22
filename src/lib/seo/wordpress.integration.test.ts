import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/entries/status-transitions", () => ({ writeAuditRow: mocks.audit }));
vi.mock("@/lib/wordpress/config", () => ({
  getWordPressSiteConfig: () => ({
    url: "https://wordpress.test",
    appUsername: "integration",
    appPassword: "secret",
  }),
  wordPressBasicAuth: () => "Basic hidden",
}));

import { applyApprovedSeoTitle } from "./wordpress";

function query(result?: unknown) {
  const value = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  value.select.mockReturnValue(value);
  value.update.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  value.neq.mockReturnValue(value);
  return value;
}

describe("approved WordPress SEO title write-back", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.audit.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("refuses a live revision mismatch before any WordPress write", async () => {
    mocks.from.mockReturnValueOnce(query({ data: {
      id: "entry-1",
      site: "pl",
      title: "Old title",
      wp_post_id: 42,
      wp_modified_at: "2026-07-22T00:00:00.000Z",
      wp_sync_status: "synced",
    } }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: { raw: "Old title" },
        content: { raw: "" },
        modified_gmt: "2026-07-22T00:01:00.000",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await applyApprovedSeoTitle("entry-1", "manager", {
      title: "Approved replacement title",
      focusKeyphrase: "fantasy baseball rankings",
      metaDescription: "A detailed fantasy baseball rankings guide with targets, sleepers, and draft-day advice for the full season.",
      expectedWpModifiedAt: "2026-07-22T00:00:00.000Z",
    });

    expect(result).toMatchObject({ ok: false, conflict: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leases, writes only the title, checkpoints, and audits before/after", async () => {
    mocks.from
      .mockReturnValueOnce(query({ data: {
        id: "entry-1",
        site: "pl",
        title: "Old title",
        wp_post_id: 42,
        wp_modified_at: "2026-07-22T00:00:00.000Z",
        wp_sync_status: "synced",
      } }))
      .mockReturnValueOnce(query({ data: { id: "entry-1" } }))
      .mockReturnValueOnce(query());
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: { raw: "Old title" },
          content: { raw: "" },
          modified_gmt: "2026-07-22T00:00:00.000",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ modified_gmt: "2026-07-22T00:02:00.000" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await applyApprovedSeoTitle("entry-1", "manager", {
      title: "Approved replacement title",
      focusKeyphrase: "fantasy baseball rankings",
      metaDescription: "A detailed fantasy baseball rankings guide with targets, sleepers, and draft-day advice for the full season.",
      expectedWpModifiedAt: "2026-07-22T00:00:00.000Z",
    });

    expect(result).toEqual({ ok: true, modifiedAt: "2026-07-22T00:02:00.000Z" });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://wordpress.test/wp-json/wp/v2/posts/42",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Approved replacement title",
          meta: {
            _yoast_wpseo_focuskw: "fantasy baseball rankings",
            _yoast_wpseo_title: "Approved replacement title",
            _yoast_wpseo_metadesc: "A detailed fantasy baseball rankings guide with targets, sleepers, and draft-day advice for the full season.",
          },
        }),
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      "entry-1",
      "manager",
      "field_edit",
      "seo_title",
      "Old title",
      "Approved replacement title",
    );
  });
});
