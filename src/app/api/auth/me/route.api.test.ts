import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";

const { getCurrentUser } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser }));

import { GET } from "./route";

const authenticatedUser: CurrentUser = {
  id: "10000000-0000-4000-8000-000000000001",
  wp_user_id: 42,
  wp_site: "pl",
  email: "writer@example.com",
  display_name: "Test Writer",
  avatar_url: null,
  bio: null,
  timezone: "America/New_York",
  theme: "dark",
  can_publish: false,
  onboarding_completed: true,
  roles: ["writer"],
  role_rows: [{ role: "writer", site: "pl" }],
  session_id: "20000000-0000-4000-8000-000000000001",
};

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
  });

  it("returns the shared 401 envelope when no session resolves", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Not authenticated",
      code: "NOT_AUTHENTICATED",
    });
  });

  it("returns the resolved current-user contract", async () => {
    getCurrentUser.mockResolvedValue(authenticatedUser);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: authenticatedUser });
  });
});
