"use client";

import * as React from "react";
import { Bell, Check, Clock3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  EVENT_TYPE_GROUPS,
  EVENT_TYPE_LABELS,
  NOTIFICATION_EVENT_TYPES,
  type ChannelPrefs,
  type NotificationEventType,
} from "@/lib/notifications/defaults";
import type { NotificationDeliverySettings } from "@/lib/notifications/schedule";

type Props = {
  userId: string;
};

type PreferenceMatrix = Record<NotificationEventType, ChannelPrefs>;

export function NotificationPrefsPanel({ userId }: Props) {
  const [prefs, setPrefs] = React.useState<PreferenceMatrix | null>(null);
  const [delivery, setDelivery] = React.useState<NotificationDeliverySettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}/notification-prefs`)
      .then((r) => r.json())
      .then((data: {
        preferences: PreferenceMatrix;
        deliverySettings: NotificationDeliverySettings;
      }) => {
        if (!cancelled) {
          setPrefs(data.preferences);
          setDelivery(data.deliverySettings);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function setChannel(
    eventType: NotificationEventType,
    channel: keyof ChannelPrefs,
    value: boolean,
  ) {
    setPrefs((prev) =>
      prev
        ? {
            ...prev,
            [eventType]: { ...prev[eventType], [channel]: value },
          }
        : prev,
    );
  }

  async function save() {
    if (!prefs || !delivery) return;
    if (Boolean(delivery.quiet_hours_start) !== Boolean(delivery.quiet_hours_end)) {
      setError("Set both quiet-hour times, or leave both blank.");
      return;
    }
    setSaving(true);
    setError(null);

    const preferences = NOTIFICATION_EVENT_TYPES.map((type) => ({
      event_type: type,
      in_app_enabled: prefs[type].in_app_enabled,
    }));

    try {
      const res = await fetch(`/api/users/${userId}/notification-prefs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences,
          delivery_settings: {
            mode: delivery.mode,
            digest_time: delivery.digest_time.slice(0, 5),
            quiet_hours_start: delivery.quiet_hours_start?.slice(0, 5) ?? null,
            quiet_hours_end: delivery.quiet_hours_end?.slice(0, 5) ?? null,
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Save failed");
      } else {
        setSavedAt(new Date());
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !prefs || !delivery) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-text-zero" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            Delivery schedule
          </CardTitle>
          <CardDescription>
            Notifications are delivered only inside this dashboard. Choose immediate delivery or a daily batch in your {delivery.timezone} timezone. Failed database writes retry up to three times and appear in System health for administrators.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="notification-delivery-mode">Delivery</Label>
            <Select
              value={delivery.mode}
              onValueChange={(mode) =>
                setDelivery((current) =>
                  current
                    ? { ...current, mode: mode as NotificationDeliverySettings["mode"] }
                    : current,
                )
              }
            >
              <SelectTrigger id="notification-delivery-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Immediately</SelectItem>
                <SelectItem value="daily_digest">Daily batch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notification-digest-time">Daily batch time</Label>
            <Input
              id="notification-digest-time"
              type="time"
              value={delivery.digest_time.slice(0, 5)}
              onChange={(event) =>
                setDelivery({ ...delivery, digest_time: event.target.value })
              }
              disabled={delivery.mode !== "daily_digest"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notification-quiet-start">Quiet hours start</Label>
            <Input
              id="notification-quiet-start"
              type="time"
              value={delivery.quiet_hours_start?.slice(0, 5) ?? ""}
              onChange={(event) =>
                setDelivery({
                  ...delivery,
                  quiet_hours_start: event.target.value || null,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notification-quiet-end">Quiet hours end</Label>
            <Input
              id="notification-quiet-end"
              type="time"
              value={delivery.quiet_hours_end?.slice(0, 5) ?? ""}
              onChange={(event) =>
                setDelivery({
                  ...delivery,
                  quiet_hours_end: event.target.value || null,
                })
              }
            />
          </div>
          <p className="text-xs text-text-zero md:col-span-2">
            Leave both quiet-hour fields blank to disable them. Items held for a daily batch or quiet hours remain private and appear together after the scheduled local time.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
          <CardDescription>
            Choose which events appear in your dashboard. Defaults are based
            on your role — tweak any row you want.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {EVENT_TYPE_GROUPS.map((group) => (
            <section key={group.label}>
              <h3 className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-wider text-text-zero">
                {group.label}
              </h3>
              <div className="plpd-table-shell overflow-hidden">
                <table className="plpd-table font-data">
                  <thead className="bg-surface-3">
                    <tr>
                      <th className="w-full px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-text-zero">
                        Event
                      </th>
                      <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-text-zero">
                        <Bell className="mx-auto h-3 w-3" />
                        <span className="sr-only">In-app</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.types.map((type) => (
                      <tr key={type} className="hover:bg-surface-3/40">
                        <td className="px-3 py-2 text-text-team">
                          {EVENT_TYPE_LABELS[type]}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Switch
                            checked={prefs[type].in_app_enabled}
                            onCheckedChange={(v) =>
                              setChannel(type, "in_app_enabled", v)
                            }
                            aria-label={`In-app: ${EVENT_TYPE_LABELS[type]}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : savedAt ? (
          <p className="flex items-center gap-1.5 text-sm text-green">
            <Check className="h-3.5 w-3.5" />
            Saved
          </p>
        ) : null}
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Save preferences"
          )}
        </Button>
      </div>
    </div>
  );
}
