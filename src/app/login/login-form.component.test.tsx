import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const { refresh, replace } = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    refresh.mockReset();
    replace.mockReset();
    vi.unstubAllGlobals();
  });

  it("submits trimmed credentials and follows a successful session", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "user-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm />);

    await user.type(
      screen.getByRole("textbox", {
        name: "WordPress username or email",
      }),
      "  writer@example.com  ",
    );
    await user.type(screen.getByLabelText("Application password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "writer@example.com",
        password: "secret",
      }),
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith("/my-tasks");
  });

  it("renders a safe API failure and allows a retry", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Credentials not accepted" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(<LoginForm />);

    await user.type(
      screen.getByRole("textbox", {
        name: "WordPress username or email",
      }),
      "writer",
    );
    await user.type(screen.getByLabelText("Application password"), "bad-pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Credentials not accepted",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
