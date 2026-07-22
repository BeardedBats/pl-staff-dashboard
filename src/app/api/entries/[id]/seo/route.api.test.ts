import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  authorization: vi.fn(),
  canView: vi.fn(),
  participant: vi.fn(),
  manager: vi.fn(),
  workspace: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/authorization", () => ({
  loadEntryAuthorizationContext: mocks.authorization,
  canViewEntryResource: mocks.canView,
  isEntryParticipant: mocks.participant,
  isManagerPlusForSite: mocks.manager,
}));
vi.mock("@/lib/seo/wordpress", () => ({
  getSeoWorkspace: mocks.workspace,
  applyApprovedSeoTitle: mocks.apply,
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "entry-1" }) };
const getRequest = new Request("http://localhost/api/entries/entry-1/seo");
function postRequest(body: unknown) {
  return new Request("http://localhost/api/entries/entry-1/seo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("SEO workspace API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "viewer" });
    mocks.authorization.mockResolvedValue({ id: "entry-1", site: "pl" });
    mocks.canView.mockReturnValue(true);
    mocks.participant.mockReturnValue(true);
    mocks.manager.mockReturnValue(false);
    mocks.workspace.mockResolvedValue({ title: "Current title" });
    mocks.apply.mockResolvedValue({ ok: true, modifiedAt: "2026-07-22T00:00:00Z" });
  });

  it("allows an entry participant to analyze", async () => {
    const response = await GET(getRequest, context);
    expect(response.status).toBe(200);
    expect(mocks.workspace).toHaveBeenCalledWith("entry-1");
  });

  it("hides analysis from an unrelated viewer", async () => {
    mocks.participant.mockReturnValue(false);
    const response = await GET(getRequest, context);
    expect(response.status).toBe(404);
  });

  it("requires manager authority and explicit approval for write-back", async () => {
    const body = {
      title: "A deliberately approved title",
      focus_keyphrase: "fantasy baseball rankings",
      meta_description: "A detailed fantasy baseball rankings guide with targets, sleepers, and draft-day advice for the full season.",
      expected_wp_modified_at: "2026-07-22T00:00:00.000Z",
      confirm: true,
    };
    const denied = await POST(postRequest(body), context);
    expect(denied.status).toBe(404);

    mocks.manager.mockReturnValue(true);
    const unconfirmed = await POST(postRequest({ ...body, confirm: false }), context);
    expect(unconfirmed.status).toBe(400);
    const approved = await POST(postRequest(body), context);
    expect(approved.status).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith("entry-1", "viewer", {
      title: body.title,
      focusKeyphrase: body.focus_keyphrase,
      metaDescription: body.meta_description,
      expectedWpModifiedAt: body.expected_wp_modified_at,
    });
  });

  it("returns conflict when the WordPress revision changed", async () => {
    mocks.manager.mockReturnValue(true);
    mocks.apply.mockResolvedValue({ ok: false, error: "changed", conflict: true });
    const response = await POST(
      postRequest({
        title: "A deliberately approved title",
        focus_keyphrase: "fantasy baseball rankings",
        meta_description: "A detailed fantasy baseball rankings guide with targets, sleepers, and draft-day advice for the full season.",
        expected_wp_modified_at: "2026-07-22T00:00:00.000Z",
        confirm: true,
      }),
      context,
    );
    expect(response.status).toBe(409);
  });
});
