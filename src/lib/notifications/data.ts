import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildDefaultPreferences,
  NOTIFICATION_EVENT_TYPES,
  type ChannelPrefs,
  type NotificationEventType,
} from "./defaults";
import type { AppRole } from "@/lib/auth/current-user";
import {
  notificationAvailableAt,
  type NotificationDeliverySettings,
} from "./schedule";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type NotificationRow = {
  id: string;
  user_id: string;
  entry_id: string | null;
  type: NotificationEventType;
  title: string;
  body: string | null;
  is_read: boolean;
  available_at: string;
  delivery_attempts: number;
  created_at: string;
};

export type NotificationPreferenceRow = {
  id: string;
  user_id: string;
  event_type: NotificationEventType;
  in_app_enabled: boolean;
};

// --------------------------------------------------------------------------
// Dispatch — the main entry point used by trigger.ts
// --------------------------------------------------------------------------

type DispatchInput = {
  userId: string;
  entryId: string | null;
  type: NotificationEventType;
  title: string;
  body: string | null;
  dedupeKey?: string;
};

export type DispatchResult = { ok: true; deduplicated: boolean } | { ok: false };

/**
 * Dispatch a notification to one user.
 *
 * Steps:
 *   1. Load the user's preference row for this event type (fall back to
 *      the role-based default if no explicit row exists).
 *   2. If in-app delivery is enabled, insert a row into `notifications`.
 *
 * Never throws — delivery failures are logged and silently absorbed. The
 * caller continues with the rest of its work.
 */
export async function dispatchNotification(
  input: DispatchInput,
): Promise<DispatchResult> {
  const supabase = getSupabaseAdmin();

  // 1. Confirm the recipient exists and load their role-based preference.
  const { data: user } = await supabase
    .from("users")
    .select(
      "id, timezone, notification_delivery_mode, notification_digest_time, notification_quiet_start, notification_quiet_end",
    )
    .eq("id", input.userId)
    .maybeSingle();
  if (!user) return { ok: false };

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", input.userId);
  const roles = ((roleRows ?? []) as Array<{ role: AppRole }>).map((r) => r.role);

  const prefs = await resolvePreferencesForUser(input.userId, roles, input.type);
  if (!prefs.in_app_enabled) {
    return { ok: true, deduplicated: false };
  }

  const deliverySettings: NotificationDeliverySettings = {
    mode: user.notification_delivery_mode as NotificationDeliverySettings["mode"],
    digest_time: user.notification_digest_time,
    quiet_hours_start: user.notification_quiet_start,
    quiet_hours_end: user.notification_quiet_end,
    timezone: user.timezone || "UTC",
  };
  let availableAt: Date;
  try {
    availableAt = notificationAvailableAt(new Date(), deliverySettings);
  } catch {
    availableAt = new Date();
  }

  const payload = {
    id: crypto.randomUUID(),
    user_id: input.userId,
    entry_id: input.entryId,
    type: input.type,
    title: input.title,
    body: input.body,
    is_read: false,
    dedupe_key: input.dedupeKey ?? null,
    available_at: availableAt.toISOString(),
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const attemptPayload = { ...payload, delivery_attempts: attempt };
    const { data: inserted, error: insertError } = input.dedupeKey
      ? await supabase
          .from("notifications")
          .upsert(attemptPayload, {
            onConflict: "user_id,dedupe_key",
            ignoreDuplicates: true,
          })
          .select("id")
          .maybeSingle()
      : await supabase
          .from("notifications")
          .upsert(attemptPayload, { onConflict: "id" })
          .select("id")
          .single();
    if (!insertError) {
      return {
        ok: true,
        deduplicated: Boolean(input.dedupeKey && !inserted),
      };
    }
  }
  return { ok: false };
}

/**
 * Broadcast a notification to every user in a set. Useful for events like
 * "content_submitted" that go to the whole editor pool.
 */
export async function dispatchNotificationBulk(
  userIds: string[],
  base: Omit<DispatchInput, "userId">,
): Promise<DispatchResult[]> {
  // Dedupe.
  const uniqueIds = Array.from(new Set(userIds));
  return Promise.all(
    uniqueIds.map((userId) => dispatchNotification({ ...base, userId })),
  );
}

// --------------------------------------------------------------------------
// Preference resolution
// --------------------------------------------------------------------------

/**
 * Return the merged ChannelPrefs for a user + event type.
 * Looks up an explicit preference row first; falls back to role-based
 * defaults if nothing is stored.
 */
export async function resolvePreferencesForUser(
  userId: string,
  roles: AppRole[],
  eventType: NotificationEventType,
): Promise<ChannelPrefs> {
  const supabase = getSupabaseAdmin();

  const { data: row } = await supabase
    .from("notification_preferences")
    .select("in_app_enabled")
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .maybeSingle();

  if (row) {
    return {
      in_app_enabled: Boolean(row.in_app_enabled),
    };
  }

  const defaults = buildDefaultPreferences(roles);
  return defaults[eventType];
}

// --------------------------------------------------------------------------
// List (for the bell + /notifications page)
// --------------------------------------------------------------------------

export async function listNotificationsForUser(
  userId: string,
  filters: {
    onlyUnread?: boolean;
    type?: NotificationEventType;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ rows: NotificationRow[]; unreadCount: number }> {
  const supabase = getSupabaseAdmin();

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  let query = supabase
    .from("notifications")
    .select(
      "id, user_id, entry_id, type, title, body, is_read, available_at, delivery_attempts, created_at",
    )
    .eq("user_id", userId)
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.onlyUnread) query = query.eq("is_read", false);
  if (filters.type) query = query.eq("type", filters.type);

  const { data } = await query;

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("available_at", new Date().toISOString())
    .eq("is_read", false);

  return {
    rows: (data ?? []) as NotificationRow[],
    unreadCount: count ?? 0,
  };
}

// --------------------------------------------------------------------------
// Mark read / unread
// --------------------------------------------------------------------------

export const markBodySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
  is_read: z.boolean(),
});

export async function setReadStatus(
  userId: string,
  ids: string[],
  isRead: boolean,
): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("notifications")
    .update({ is_read: isRead })
    .in("id", ids)
    .eq("user_id", userId);
  return !error;
}

export async function markAllRead(userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .lte("available_at", now)
    .eq("is_read", false);
  return !error;
}

// --------------------------------------------------------------------------
// Preferences CRUD
// --------------------------------------------------------------------------

export async function getPreferencesForUser(
  userId: string,
  roles: AppRole[],
): Promise<Record<NotificationEventType, ChannelPrefs>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("notification_preferences")
    .select("event_type, in_app_enabled")
    .eq("user_id", userId);

  const stored = new Map<string, ChannelPrefs>();
  for (const row of (data ?? []) as Array<{
    event_type: string;
    in_app_enabled: boolean;
  }>) {
    stored.set(row.event_type, {
      in_app_enabled: Boolean(row.in_app_enabled),
    });
  }

  const defaults = buildDefaultPreferences(roles);
  const merged: Record<NotificationEventType, ChannelPrefs> = {} as Record<
    NotificationEventType,
    ChannelPrefs
  >;
  for (const type of NOTIFICATION_EVENT_TYPES) {
    merged[type] = stored.get(type) ?? defaults[type];
  }
  return merged;
}

export async function getDeliverySettingsForUser(
  userId: string,
): Promise<NotificationDeliverySettings | null> {
  const { data } = await getSupabaseAdmin()
    .from("users")
    .select(
      "timezone, notification_delivery_mode, notification_digest_time, notification_quiet_start, notification_quiet_end",
    )
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    mode: data.notification_delivery_mode as NotificationDeliverySettings["mode"],
    digest_time: data.notification_digest_time,
    quiet_hours_start: data.notification_quiet_start,
    quiet_hours_end: data.notification_quiet_end,
    timezone: data.timezone || "UTC",
  };
}

export const updatePreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      event_type: z.enum(NOTIFICATION_EVENT_TYPES),
      in_app_enabled: z.boolean(),
    }).strict(),
  ),
  delivery_settings: z
    .object({
      mode: z.enum(["immediate", "daily_digest"]),
      digest_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      quiet_hours_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
      quiet_hours_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    })
    .refine(
      (value) =>
        (value.quiet_hours_start === null && value.quiet_hours_end === null) ||
        (value.quiet_hours_start !== null &&
          value.quiet_hours_end !== null &&
          value.quiet_hours_start !== value.quiet_hours_end),
      { message: "Quiet hours require different start and end times" },
    ),
}).strict();

export async function setPreferencesForUser(
  userId: string,
  prefs: Array<{
    event_type: NotificationEventType;
    in_app_enabled: boolean;
  }>,
  settings: z.infer<typeof updatePreferencesSchema>["delivery_settings"],
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("replace_notification_preferences", {
    p_user_id: userId,
    p_preferences: prefs,
    p_delivery_mode: settings.mode,
    p_digest_time: settings.digest_time,
    p_quiet_start: settings.quiet_hours_start as string,
    p_quiet_end: settings.quiet_hours_end as string,
  });
  return !error;
}
