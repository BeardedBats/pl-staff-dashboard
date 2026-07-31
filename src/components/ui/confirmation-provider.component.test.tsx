import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ConfirmationProvider,
  useConfirmation,
} from "./confirmation-provider";

function ConfirmationFixture({ onResult }: { onResult: (value: boolean) => void }) {
  const confirm = useConfirmation();
  return (
    <button
      type="button"
      onClick={() =>
        void confirm({
          title: "Delete record?",
          description: "This cannot be undone.",
          confirmLabel: "Delete record",
          destructive: true,
        }).then(onResult)
      }
    >
      Open confirmation
    </button>
  );
}

describe("ConfirmationProvider", () => {
  it("resolves destructive confirmation from the branded dialog", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <ConfirmationProvider>
        <ConfirmationFixture onResult={onResult} />
      </ConfirmationProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Open confirmation" }));
    expect(
      screen.getByRole("heading", { name: "Delete record?" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete record" }));

    expect(onResult).toHaveBeenCalledWith(true);
  });
});
