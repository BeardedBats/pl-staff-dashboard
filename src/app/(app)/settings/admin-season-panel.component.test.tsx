import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { AdminSeasonPanel } from "./admin-season-panel";

describe("AdminSeasonPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows an actionable error when activation fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Season activation conflict" }), {
          status: 409,
        }),
      ),
    );

    render(
      <AdminSeasonPanel
        initialModes={[
          {
            id: "10000000-0000-4000-8000-000000000001",
            name: "Offseason",
            is_active: false,
            auto_switch_start: null,
            auto_switch_end: null,
            created_at: "2026-07-30T00:00:00.000Z",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Activate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Season activation conflict",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
