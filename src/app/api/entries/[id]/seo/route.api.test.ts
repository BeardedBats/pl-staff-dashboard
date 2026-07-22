import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  authorization: vi.fn(),
  canView: vi.fn(),
  participant: vi.fn(),
  manager: vi.fn(),
  workspace: vi.fn(),
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
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "entry-1" }) };
const getRequest = new Request("http://localhost/api/entries/entry-1/seo");

describe("SEO workspace API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "viewer" });
    mocks.authorization.mockResolvedValue({ id: "entry-1", site: "pl" });
    mocks.canView.mockReturnValue(true);
    mocks.participant.mockReturnValue(true);
    mocks.manager.mockReturnValue(false);
    mocks.workspace.mockResolvedValue({ title: "Current title" });
  });

  it("allows an entry participant to analyze", async () => {
    const response = await GET(getRequest, context);
    expect(response.status).toBe(200);
    expect(mocks.workspace).toHaveBeenCalledWith("entry-1");
  });

  it("allows a site manager to analyze a non-participant entry", async () => {
    mocks.participant.mockReturnValue(false);
    mocks.manager.mockReturnValue(true);
    const response = await GET(getRequest, context);
    expect(response.status).toBe(200);
  });

  it("requires an authenticated session", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await GET(getRequest, context);
    expect(response.status).toBe(401);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });

  it("hides analysis from an unrelated viewer", async () => {
    mocks.participant.mockReturnValue(false);
    const response = await GET(getRequest, context);
    expect(response.status).toBe(404);
  });

  it("reports an upstream read failure without exposing WordPress details", async () => {
    mocks.workspace.mockResolvedValue(null);
    const response = await GET(getRequest, context);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: "UPSTREAM_ERROR",
      error: "WordPress SEO data is unavailable",
    });
  });
});
