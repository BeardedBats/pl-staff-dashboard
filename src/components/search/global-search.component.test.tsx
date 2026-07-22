import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalSearch } from "./global-search";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("GlobalSearch", () => {
  beforeEach(() => {
    push.mockReset();
    vi.unstubAllGlobals();
  });

  it("keeps available results visible when one source is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            query: "bullpen",
            partial: true,
            unavailableKinds: ["graphic"],
            results: [
              {
                id: "entry-1",
                kind: "entry",
                title: "Bullpen report",
                context: "PL · claimed · none",
                href: "/content?entry=entry-1",
                site: "pl",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const user = userEvent.setup();
    render(<GlobalSearch />);

    await user.click(screen.getByRole("button", { name: "Search dashboard" }));
    await user.type(
      screen.getByRole("textbox", {
        name: "Search staff, content, assignments, graphics, and schedules",
      }),
      "bullpen",
    );

    expect(await screen.findByText("Some results are still unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: /Bullpen report/ })).toBeVisible();
  });

  it("shows a retry action without exposing a raw request failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private failure")));
    const user = userEvent.setup();
    render(<GlobalSearch />);

    await user.click(screen.getByRole("button", { name: "Search dashboard" }));
    await user.type(
      screen.getByRole("textbox", {
        name: "Search staff, content, assignments, graphics, and schedules",
      }),
      "bullpen",
    );

    expect(await screen.findByText("Search is temporarily unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByText("private failure")).not.toBeInTheDocument();
  });
});
