import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  approveClaim: vi.fn(),
  denyClaim: vi.fn(),
  createClaim: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/current-user")>()),
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/claims/data", () => ({
  approveClaim: mocks.approveClaim,
  denyClaim: mocks.denyClaim,
  createClaim: mocks.createClaim,
}));

import { PATCH as resolveClaim } from "./[id]/route";
import { POST as createClaim } from "../entries/[id]/claim/route";

const viewer: CurrentUser = {
  id: "10000000-0000-4000-8000-000000000001",
  wp_user_id: 1,
  wp_site: "pl",
  email: "manager@example.test",
  display_name: "Manager",
  avatar_url: null,
  bio: null,
  timezone: "UTC",
  theme: "dark",
  can_publish: false,
  onboarding_completed: true,
  roles: ["manager"],
  role_rows: [{ role: "manager", site: "pl" }],
  session_id: "session-manager",
};

const id = "50000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };

function request(action: "approve" | "deny") {
  return new Request(`http://localhost/api/claims/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

describe("editorial claim HTTP outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(viewer);
  });

  it.each([
    ["not_found", 404],
    ["forbidden", 403],
    ["conflict", 409],
    ["database", 500],
  ] as const)("maps a %s resolution failure to HTTP %s", async (kind, status) => {
    mocks.approveClaim.mockResolvedValue({
      ok: false,
      kind,
      error: "Claim resolution failed",
    });

    const response = await resolveClaim(request("approve"), context);

    expect(response.status).toBe(status);
  });

  it("returns conflict when a simultaneous writer claim wins first", async () => {
    mocks.createClaim.mockResolvedValue({
      ok: false,
      kind: "conflict",
      error: "Entry is not available for claiming",
    });
    const response = await createClaim(
      new Request(`http://localhost/api/entries/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_type: "writer" }),
      }),
      context,
    );

    expect(response.status).toBe(409);
  });

  it("returns forbidden for a site authority failure", async () => {
    mocks.createClaim.mockResolvedValue({
      ok: false,
      kind: "forbidden",
      error: "Writer role required",
    });
    const response = await createClaim(
      new Request(`http://localhost/api/entries/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_type: "writer" }),
      }),
      context,
    );

    expect(response.status).toBe(403);
  });
});
