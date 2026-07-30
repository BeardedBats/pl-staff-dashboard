import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));
vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => null,
}));
vi.mock("@/components/search/global-search", () => ({
  GlobalSearch: () => null,
}));
vi.mock("@/components/theme/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

import { Header } from "./header";

describe("Header logout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps the user in place and surfaces a failed logout", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Session revocation failed" }), {
          status: 500,
        }),
      ),
    );

    render(
      <Header
        userId="user-1"
        displayName="Test User"
        email="test@example.test"
        avatarUrl={null}
        roles={["writer"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "User menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session revocation failed",
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
