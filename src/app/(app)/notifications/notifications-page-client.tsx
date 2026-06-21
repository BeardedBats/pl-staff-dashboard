"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  CheckCheck,
  Inbox,
  Loader2,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
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
  const [typeFilter, setTypeFilter] = React.useState<NotificationEventType | "">(
    "",
  );
  const [onlyUnread, setOnlyUnread] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (typeFilter) params.set("type", typeFilter);
      if (onlyUnread) params.set("onlyUnread", "true");
      const res = await fetch(
        `/api/users/${userId}/notifications?${params.toString()}`,
      );
      const data = (await res.json()) as {
        rows: NotificationRow[];
        unreadCount: number;
      };
      setRows(data.rows ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [userId, typeFilter, onlyUnread]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function markOne(id: string, isRead: boolean) {
    await fetch(`/api/users/${userId}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], is_read: isRead }),
    });
    void refresh();
  }

  async function markAllRead() {
    await fetch(`/api/users/${userId}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    void refresh();
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
          <SelectTrigger className="h-8 w-[220px] text-xs">
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
            onClick={markAllRead}
            className="ml-auto text-text-zero"
          >
            <CheckCheck className="h-3 w-3" />
            Mark all read
          </Button>
        ) : null}
      </div>

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
                onToggleRead={() => markOne(n.id, !n.is_read)}
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
  onToggleRead,
}: {
  notification: NotificationRow;
  onToggleRead: () => void;
}) {
  const href = notification.entry_id
    ? `/content?entry=${notification.entry_id}`
    : "#";

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
      <Link href={href} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-text-cell">
            {notification.title}
          </p>
          <Badge variant="outline" className="shrink-0">
            {EVENT_TYPE_LABELS[notification.type] ?? notification.type}
          </Badge>
        </div>
        {notification.body ? (
          <p className="mt-1 line-clamp-2 text-xs text-text-team">
            {notification.body}
          </p>
        ) : null}
        <p className="mt-1 font-mono text-[10px] text-text-zero">
          {formatDate(notification.created_at, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {notification.discord_sent ? " · Discord sent" : ""}
          {notification.email_sent ? " · Email sent" : ""}
        </p>
      </Link>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleRead}
        className="shrink-0 text-text-zero opacity-0 group-hover:opacity-100"
      >
        <Check className="h-3 w-3" />
        {notification.is_read ? "Mark unread" : "Mark read"}
      </Button>
    </div>
  );
}
