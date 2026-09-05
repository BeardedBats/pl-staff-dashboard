import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), fetchUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock("@/lib/auth/wordpress", () => ({
  fetchWpUserById: mocks.fetchUser, fetchWpUserByUsername: mocks.fetchUser,
  isStaffWpUser: (roles: string[]) => roles.includes("author"),
  wpRoleToDashboardRole: () => "writer",
}));
import { importWpUser } from "./mutations";
describe("historical author directory imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchUser.mockResolvedValue({ ok: true, value: { id: 31, email: "former@example.test", name: "Former author", wp_roles: ["subscriber"], avatar_url: null, description: "" } });
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), insert: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null }), single: vi.fn().mockResolvedValue({ data: { id: "directory-user" }, error: null }) };
    for (const key of ["select", "eq", "in", "insert"] as const) query[key].mockReturnValue(query);
    mocks.from.mockReturnValue(query);
  });
  it("can retain a former author without granting a dashboard role", async () => {
    expect(await importWpUser("pl", { wpUserId: 31 }, { assignRole: false })).toMatchObject({ ok: true, created: true });
    expect(mocks.from.mock.calls.every(([table]) => table === "users")).toBe(true);
  });
  it("still blocks a non-staff user from the normal staff import", async () => {
    expect(await importWpUser("pl", { wpUserId: 31 })).toMatchObject({ ok: false });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
