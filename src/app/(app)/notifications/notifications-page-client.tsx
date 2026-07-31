"use client";

import * as React from "react";
import Link from "next/link";
import { Check, CheckCheck, Inbox, Loader2 } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { readApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  NOTIFICATION_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  type NotificationEventType,
} from "@/lib/notifications/defaults";
import {
  dispatchNotificationsChanged,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationsChangedDetail,
} from "@/lib/notifications/events";
import type { NotificationRow } from "@/lib/notifications/data";

type Props = {
  userId: string;
  initialRows: NotificationRow[];
  initialUnreadCount: number;
};

const ALL = "__all__";

export function NotificationsPageClient({
  userId,
  initialRows,
  initialUnreadCount,
}: Props) {
  const [rows, setRows] = React.useState(initialRows);
  const [unreadCount, setUnreadCount] = React.useState(initialUnreadCount);
  const [typeFilter, setTypeFilter] = React.useState<
    NotificationEventType | ""
  >("");
  const [onlyUnread, setOnlyUnread] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const requestSequence = React.useRef(0);

  const refresh = React.useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (typeFilter) params.set("type", typeFilter);
      if (onlyUnread) params.set("onlyUnread", "true");
      const res = await fetch(
        `/api/users/${userId}/notifications?${params.toString()}`,
      );
      if (!res.ok) {
        if (sequence === requestSequence.current) {
          setError(await readApiError(res, "Could not load notifications."));
        }
        return;
      }
      const data = (await res.json()) as {
        rows: NotificationRow[];
        unreadCount: number;
      };
      if (sequence === requestSequence.current) {
        setRows(data.rows ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      if (sequence === requestSequence.current) {
        setError("Could not load notifications. Check your connection and retry.");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [userId, typeFilter, onlyUnread]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    function handleNotificationsChanged(event: Event) {
      const unread = (event as CustomEvent<NotificationsChangedDetail>).detail
        ?.unreadCount;
      if (!Number.isFinite(unread)) return;
      setUnreadCount(unread);
      if (unread === 0) {
        setRows((current) =>
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

  async function markOne(id: string, isRead: boolean) {
    setBusyAction(id);
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], is_read: isRead }),
      });
      if (!response.ok) {
        setError(await readApiError(response, "Could not update the notification."));
        return;
      }
      setRows((current) =>
        onlyUnread && isRead
          ? current.filter((notification) => notification.id !== id)
          : current.map((notification) =>
              notification.id === id
                ? { ...notification, is_read: isRead }
                : notification,
            ),
      );
      const nextUnreadCount = Math.max(
        0,
        unreadCount + (isRead ? -1 : 1),
      );
      setUnreadCount(nextUnreadCount);
      dispatchNotificationsChanged(nextUnreadCount);
    } catch {
      setError("Could not update the notification. Check your connection and retry.");
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
      setRows((current) =>
        onlyUnread
          ? []
          : current.map((notification) => ({ ...notification, is_read: true })),
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
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Select
          value={typeFilter || ALL}
          onValueChange={(v) =>
            setTypeFilter(v === ALL ? "" : (v as NotificationEventType))
          }
        >
          <SelectTrigger
            aria-label="Filter notifications by type"
            className="h-8 w-[220px] text-xs"
          >
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {NOTIFICATION_EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={onlyUnread ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyUnread((v) => !v)}
        >
          {onlyUnread ? "Showing unread only" : "Show unread only"}
          {unreadCount > 0 ? (
            <Badge variant="cyan" className="ml-2">
              {unreadCount}
            </Badge>
          ) : null}
        </Button>

        {unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void markAllRead()}
            disabled={busyAction !== null}
            className="ml-auto text-text-zero"
          >
            {busyAction === "all" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCheck className="h-3 w-3" />
            )}
            {busyAction === "all" ? "Marking…" : "Mark all read"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {error}
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card py-10">
          <Loader2 className="h-5 w-5 animate-spin text-text-zero" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Nothing here"
          description={
            onlyUnread || typeFilter
              ? "Try clearing filters to see more notifications."
              : "You haven't received any notifications yet. They'll appear here when someone @mentions you, approves a claim, or asks for a graphic."
          }
        />
      ) : (
        <ol className="space-y-2">
          {rows.map((n) => (
            <li key={n.id}>
              <NotificationListRow
                notification={n}
                busy={busyAction === n.id}
                onToggleRead={() => void markOne(n.id, !n.is_read)}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NotificationListRow({
  notification,
  busy,
  onToggleRead,
}: {
  notification: NotificationRow;
  busy: boolean;
  onToggleRead: () => void;
}) {
  const notificationContent = (
    <>
      <div className="flex items-center gap-2">
        <p className="break-words text-sm font-medium text-text-cell">
          {notification.title}
        </p>
        <Badge variant="outline" className="shrink-0">
          {EVENT_TYPE_LABELS[notification.type] ?? notification.type}
        </Badge>
      </div>
      {notification.body ? (
        <p className="mt-1 break-words text-xs text-text-team">
          {notification.body}
        </p>
      ) : null}
      <p className="mt-1 font-data text-[10px] text-text-zero">
        {formatDate(notification.created_at, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </p>
    </>
  );

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:border-surface-5",
        !notification.is_read && "border-cyan/30 bg-cyan-dim/20",
      )}
    >
      <div className="mt-1.5 shrink-0">
        {notification.is_read ? (
          <span className="block h-1.5 w-1.5 rounded-full bg-text-zero/40" />
        ) : (
          <span className="block h-1.5 w-1.5 rounded-full bg-cyan" />
        )}
      </div>
      {notification.entry_id ? (
        <Link
          href={`/content?entry=${notification.entry_id}`}
          className="min-w-0 flex-1"
        >
          {notificationContent}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{notificationContent}</div>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleRead}
        disabled={busy}
        className="shrink-0 text-text-zero opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
        {busy
          ? "Updating…"
          : notification.is_read
            ? "Mark unread"
            : "Mark read"}
      </Button>
    </div>
  );
}
