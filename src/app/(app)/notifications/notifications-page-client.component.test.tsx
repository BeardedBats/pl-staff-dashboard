import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsPageClient } from "./notifications-page-client";
import type { NotificationRow } from "@/lib/notifications/data";

const notification: NotificationRow = {
  id: "10000000-0000-4000-8000-000000000001",
  user_id: "10000000-0000-4000-8000-000000000002",
  entry_id: null,
  type: "mention",
  title: "You were mentioned",
  body: "Please review this note.",
  is_read: false,
  available_at: "2026-07-30T00:00:00.000Z",
  delivery_attempts: 1,
  created_at: "2026-07-30T00:00:00.000Z",
};

function listResponse() {
  return new Response(
    JSON.stringify({ rows: [notification], unreadCount: 1 }),
    { status: 200 },
  );
}

describe("NotificationsPageClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks every notification read and updates the page immediately", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NotificationsPageClient
        userId={notification.user_id}
        initialRows={[notification]}
        initialUnreadCount={1}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Mark all read" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Mark unread" })).toBeVisible();
  });

  it("keeps unread state and reports a failed mark-all request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "Failed to update notifications" }),
          { status: 500 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NotificationsPageClient
        userId={notification.user_id}
        initialRows={[notification]}
        initialUnreadCount={1}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Mark all read" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to update notifications",
    );
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mark read" })).toBeVisible();
  });

  it("renders entry-less notifications as content instead of a dead link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listResponse()));

    render(
      <NotificationsPageClient
        userId={notification.user_id}
        initialRows={[notification]}
        initialUnreadCount={1}
      />,
    );

    expect(screen.getByText(notification.title).closest("a")).toBeNull();
  });
});
