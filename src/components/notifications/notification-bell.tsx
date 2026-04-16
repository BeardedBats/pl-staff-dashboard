"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Check, Inbox } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { NotificationRow } from "@/lib/notifications/data";

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
  const [notifications, setNotifications] = React.useState<NotificationRow[]>(
    [],
  );
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(
        `/api/users/${userId}/notifications?limit=10`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        rows: NotificationRow[];
        unreadCount: number;
      };
      setNotifications(data.rows ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Ignore network hiccups; next tick will retry.
    }
  }, [userId]);

  React.useEffect(() => {
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Refresh when the popover opens so the list is fresh.
  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function markOneRead(notificationId: string) {
    await fetch(`/api/users/${userId}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [notificationId], is_read: true }),
    });
    void load();
  }

  async function markAllRead() {
    await fetch(`/api/users/${userId}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    void load();
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
              className={cn(
                "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan px-1 font-mono text-[9px] font-bold text-navy-1",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">
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
              onClick={markAllRead}
              className="text-xs text-text-muted"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <Inbox className="mb-2 h-6 w-6 text-text-muted" />
              <p className="text-sm font-medium text-text-primary">All clear</p>
              <p className="mt-1 text-xs text-text-muted">
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
                    onMarkRead={() => markOneRead(n.id)}
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
  onMarkRead,
}: {
  notification: NotificationRow;
  onMarkRead: () => void;
}) {
  const href = notification.entry_id
    ? `/content?entry=${notification.entry_id}`
    : "/notifications";

  return (
    <Link
      href={href}
      onClick={onMarkRead}
      className={cn(
        "block px-4 py-3 transition-colors hover:bg-navy-3",
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
          <p className="text-sm font-medium text-text-primary">
            {notification.title}
          </p>
          {notification.body ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
              {notification.body}
            </p>
          ) : null}
          <p className="mt-1 text-[10px] text-text-muted">
            {formatDate(notification.created_at, {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        </div>
      </div>
    </Link>
  );
}
