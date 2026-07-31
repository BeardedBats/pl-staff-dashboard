import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./notification-bell";
import type { NotificationRow } from "@/lib/notifications/data";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

const notification: NotificationRow = {
  id: "20000000-0000-4000-8000-000000000001",
  user_id: "20000000-0000-4000-8000-000000000002",
  entry_id: null,
  type: "mention",
  title: "Bell notification",
  body: null,
  is_read: false,
  available_at: "2026-07-30T00:00:00.000Z",
  delivery_attempts: 1,
  created_at: "2026-07-30T00:00:00.000Z",
};

const listResponse = () =>
  new Response(JSON.stringify({ rows: [notification], unreadCount: 1 }), {
    status: 200,
  });

describe("NotificationBell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("surfaces mark-all failures instead of silently refreshing", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Notification update failed" }), {
          status: 500,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationBell userId={notification.user_id} />);
    const trigger = await screen.findByRole("button", {
      name: "1 unread notifications",
    });
    await user.click(trigger);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "Mark all read" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Notification update failed",
    );
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeEnabled();
  });

  it("shows load failures instead of an all-clear empty state", async () => {
    const user = userEvent.setup();
    const failedResponse = () =>
      new Response(JSON.stringify({ error: "Notification service failed" }), {
        status: 500,
      });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(failedResponse())),
    );

    render(<NotificationBell userId={notification.user_id} />);
    await user.click(
      screen.getByRole("button", { name: "Notifications" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Notification service failed",
    );
    expect(screen.queryByText("All clear")).not.toBeInTheDocument();
  });

  it("does not decrement unread count for an already-read notification", async () => {
    const user = userEvent.setup();
    const readNotification = { ...notification, is_read: true };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ rows: [readNotification], unreadCount: 2 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ rows: [readNotification], unreadCount: 2 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationBell userId={notification.user_id} />);
    const trigger = await screen.findByRole("button", {
      name: "2 unread notifications",
    });
    await user.click(trigger);
    await user.click(await screen.findByText("Bell notification"));

    expect(
      screen.getByRole("button", { name: "2 unread notifications" }),
    ).toBeEnabled();
  });
});
