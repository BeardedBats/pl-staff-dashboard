"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Inbox, Loader2 } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { readApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { NotificationRow } from "@/lib/notifications/data";
import {
  dispatchNotificationsChanged,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationsChangedDetail,
} from "@/lib/notifications/events";

type NotificationBellProps = {
  userId: string;
};

/**
 * Notification bell for the header.
 *
 * On mount, polls /api/users/:id/notifications every 30 seconds for unread
 * count + the 10 most recent. Clicking the bell opens a popover with the
 * latest items and links to the full page.
 */
export function NotificationBell({ userId }: NotificationBellProps) {
  const router = useRouter();
  const [notifications, setNotifications] = React.useState<NotificationRow[]>(
    [],
  );
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/users/${userId}/notifications?limit=10`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(await readApiError(res, "Could not load notifications."));
        return;
      }
      const data = (await res.json()) as {
        rows: NotificationRow[];
        unreadCount: number;
      };
      setNotifications(data.rows ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setError(null);
    } catch {
      setError("Could not load notifications. Check your connection and retry.");
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  React.useEffect(() => {
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    function handleNotificationsChanged(event: Event) {
      const unread = (event as CustomEvent<NotificationsChangedDetail>).detail
        ?.unreadCount;
      if (!Number.isFinite(unread)) return;
      setUnreadCount(unread);
      if (unread === 0) {
        setNotifications((current) =>
          current.map((notification) => ({
            ...notification,
            is_read: true,
          })),
        );
      }
    }

    window.addEventListener(
      NOTIFICATIONS_CHANGED_EVENT,
      handleNotificationsChanged,
    );
    return () =>
      window.removeEventListener(
        NOTIFICATIONS_CHANGED_EVENT,
        handleNotificationsChanged,
      );
  }, []);

  // Refresh when the popover opens so the list is fresh.
  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function markOneRead(
    notificationId: string,
    href: string,
  ): Promise<void> {
    const wasUnread = notifications.some(
      (notification) =>
        notification.id === notificationId && !notification.is_read,
    );
    setBusyAction(notificationId);
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notificationId], is_read: true }),
      });
      if (!response.ok) {
        setError(await readApiError(response, "Could not mark the notification as read."));
        return;
      }
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, is_read: true }
            : notification,
        ),
      );
      if (wasUnread) {
        const nextUnreadCount = Math.max(0, unreadCount - 1);
        setUnreadCount(nextUnreadCount);
        dispatchNotificationsChanged(nextUnreadCount);
      }
      setOpen(false);
      router.push(href);
    } catch {
      setError("Could not mark the notification as read. Check your connection and retry.");
    } finally {
      setBusyAction(null);
    }
  }

  async function markAllRead() {
    setBusyAction("all");
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (!response.ok) {
        setError(await readApiError(response, "Could not mark all notifications as read."));
        return;
      }
      setNotifications((current) =>
        current.map((notification) => ({ ...notification, is_read: true })),
      );
      setUnreadCount(0);
      dispatchNotificationsChanged(0);
    } catch {
      setError("Could not mark all notifications as read. Check your connection and retry.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-tour="notification-bell"
          aria-label={
            unreadCount > 0
              ? `${unreadCount} unread notifications`
              : "Notifications"
          }
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span
              data-plpd-compact-label
              className={cn(
                "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan px-1 font-sans text-[9px] font-bold text-surface-1",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-1rem))] p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-cell">
              Notifications
            </h3>
            {unreadCount > 0 ? (
              <Badge variant="cyan">{unreadCount} new</Badge>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void markAllRead()}
              disabled={busyAction !== null}
              className="text-xs text-text-zero"
            >
              {busyAction === "all" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              {busyAction === "all" ? "Marking…" : "Mark all read"}
            </Button>
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 border-b border-red/30 bg-red/10 px-4 py-2 text-xs text-red"
          >
            <span>{error}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void load()}
              className="h-7 shrink-0 text-xs"
            >
              Retry
            </Button>
          </div>
        ) : null}

        <div className="max-h-96 overflow-y-auto">
          {!loaded ? (
            <div className="flex items-center justify-center px-4 py-10">
              <Loader2 className="h-5 w-5 animate-spin text-text-zero" />
              <span className="sr-only">Loading notifications</span>
            </div>
          ) : notifications.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <Inbox className="mb-2 h-6 w-6 text-text-zero" />
              <p className="text-sm font-medium text-text-cell">All clear</p>
              <p className="mt-1 text-xs text-text-zero">
                No notifications yet. @mentions, claim updates, and graphic
                requests will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id}>
                  <NotificationListItem
                    notification={n}
                    busy={busyAction === n.id}
                    onMarkRead={(href) => markOneRead(n.id, href)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <Separator />
        <div className="px-4 py-2">
          <Link
            href="/notifications"
            className="block text-center text-xs text-cyan hover:underline"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationListItem({
  notification,
  busy,
  onMarkRead,
}: {
  notification: NotificationRow;
  busy: boolean;
  onMarkRead: (href: string) => Promise<void>;
}) {
  const href = notification.entry_id
    ? `/content?entry=${notification.entry_id}`
    : "/notifications";

  return (
    <Link
      href={href}
      aria-busy={busy}
      onClick={(event) => {
        event.preventDefault();
        if (!busy) void onMarkRead(href);
      }}
      className={cn(
        "block px-4 py-3 transition-colors hover:bg-surface-3",
        busy && "pointer-events-none opacity-70",
        !notification.is_read && "bg-cyan-dim/30",
      )}
    >
      <div className="flex items-start gap-2">
        {!notification.is_read ? (
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" />
        ) : (
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-cell">
            {notification.title}
          </p>
          {notification.body ? (
            <p className="mt-0.5 break-words text-xs text-text-team">
              {notification.body}
            </p>
          ) : null}
          <p className="mt-1 text-[10px] text-text-zero">
            {formatDate(notification.created_at, {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "America/New_York",
            })}
          </p>
        </div>
      </div>
    </Link>
  );
}
