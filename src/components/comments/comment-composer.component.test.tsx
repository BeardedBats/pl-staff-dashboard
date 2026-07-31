import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentComposer } from "./comment-composer";

describe("CommentComposer mentions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows staff request failures", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Staff unavailable" }), {
          status: 503,
        }),
      ),
    );
    render(
      <CommentComposer entryId="entry-1" onSubmit={vi.fn()} />,
    );

    await user.click(screen.getByRole("textbox"));

    expect(
      await screen.findByText(/Could not load teammates for mentions/),
    ).toBeVisible();
  });

  it("shows suggestions on the first mention request", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            users: [
              {
                id: "user-1",
                display_name: "Ada Lovelace",
                avatar_url: null,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    render(
      <CommentComposer entryId="entry-1" onSubmit={vi.fn()} />,
    );

    await user.type(screen.getByRole("textbox"), "@Ada");

    expect(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    ).toBeVisible();
  });
});
