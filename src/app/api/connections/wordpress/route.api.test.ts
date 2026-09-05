import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/wp-sync/posts", () => ({ syncWpPostsForSite: mocks.sync }));
import { POST } from "./route";
describe("PL WordPress recovery boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects anonymous requests", async () => { mocks.user.mockResolvedValue(null); expect((await POST()).status).toBe(401); expect(mocks.sync).not.toHaveBeenCalled(); });
  it("rejects another site's Operations role", async () => {
    mocks.user.mockResolvedValue({ id: "ops", role_rows: [{ role: "operations", site: "qb" }] });
    expect((await POST()).status).toBe(403); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("rejects a PL writer", async () => {
    mocks.user.mockResolvedValue({ id: "writer", role_rows: [{ role: "writer", site: "pl" }] });
    expect((await POST()).status).toBe(403);
  });
  it("synchronizes only PL for a PL operator", async () => {
    mocks.user.mockResolvedValue({ id: "ops", role_rows: [{ role: "operations", site: "pl" }] });
    mocks.sync.mockResolvedValue({ errors: [] });
    expect((await POST()).status).toBe(200); expect(mocks.sync).toHaveBeenCalledWith("pl", "ops");
  });
  it("reports partial failure instead of success", async () => {
    mocks.user.mockResolvedValue({ id: "ops", role_rows: [{ role: "operations", site: "pl" }] });
    mocks.sync.mockResolvedValue({ errors: [{ wpPostId: 42 }] });
    expect((await POST()).status).toBe(502);
  });
});
