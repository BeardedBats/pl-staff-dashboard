import { beforeEach, describe, expect, it, vi } from "vitest";

const { performLogin } = vi.hoisted(() => ({ performLogin: vi.fn() }));

vi.mock("@/lib/auth/login", () => ({ performLogin }));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    performLogin.mockReset();
  });

  it("rejects an incomplete request before authentication", async () => {
    const response = await POST(request({ username: "writer", password: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Validation failed",
    });
    expect(performLogin).not.toHaveBeenCalled();
  });

  it("preserves the safe status and message from authentication", async () => {
    performLogin.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Your WordPress account does not have an eligible staff role.",
    });

    const response = await POST(
      request({ username: "subscriber", password: "application-password" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "FORBIDDEN",
      error: "Your WordPress account does not have an eligible staff role.",
    });
  });

  it("returns only the public authenticated-user shape", async () => {
    const user = {
      id: "10000000-0000-4000-8000-000000000001",
      email: "writer@example.com",
      display_name: "Writer",
      wp_site: "pl",
      onboarding_completed: false,
    };
    performLogin.mockResolvedValue({ ok: true, user });

    const response = await POST(
      request({ username: "writer", password: "application-password" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user });
    expect(performLogin).toHaveBeenCalledWith(
      "writer",
      "application-password",
    );
  });
});
