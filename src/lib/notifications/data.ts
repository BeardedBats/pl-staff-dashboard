import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import {
  formatDiscordBody,
  sendDiscordDM,
  sendEmail,
} from "./delivery";
import {
  buildDefaultPreferences,
  NOTIFICATION_EVENT_TYPES,
  type ChannelPrefs,
  type NotificationEventType,
} from "./defaults";
import type { AppRole } from "@/lib/auth/current-user";

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
  discord_sent: boolean;
  email_sent: boolean;
  created_at: string;
};

export type NotificationPreferenceRow = {
  id: string;
  user_id: string;
  event_type: NotificationEventType;
  discord_enabled: boolean;
  email_enabled: boolean;
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
  actionPath?: string;
};

/**
 * Dispatch a notification to one user.
 *
 * Steps:
 *   1. Load the user's preference row for this event type (fall back to
 *      the role-based default if no explicit row exists).
 *   2. If in_app is enabled, insert a row into `notifications`.
 *   3. If discord is enabled AND we have their discord_id, call the
 *      Discord stub.
 *   4. If email is enabled AND we have their email, call the Resend stub.
 *   5. Flip the discord_sent / email_sent flags on the row as applicable.
 *
 * Never throws — delivery failures are logged and silently absorbed. The
 * caller continues with the rest of its work.
 */
export async function dispatchNotification(
  input: DispatchInput,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // 1. Load the recipient's profile + prefs.
  const { data: user } = await supabase
    .from("users")
    .select("id, email, display_name, discord_id")
    .eq("id", input.userId)
    .maybeSingle();
  if (!user) return;

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", input.userId);
  const roles = ((roleRows ?? []) as Array<{ role: AppRole }>).map((r) => r.role);

  const prefs = await resolvePreferencesForUser(input.userId, roles, input.type);
  if (!prefs.in_app_enabled && !prefs.discord_enabled && !prefs.email_enabled) {
    return;
  }

  // 2. In-app insert.
  let notificationId: string | null = null;
  if (prefs.in_app_enabled) {
    const { data: inserted } = await supabase
      .from("notifications")
      .insert({
        user_id: input.userId,
        entry_id: input.entryId,
        type: input.type,
        title: input.title,
        body: input.body,
        is_read: false,
      })
      .select("id")
      .single();
    notificationId = (inserted?.id as string | null) ?? null;
  }

  const actionUrl = buildActionUrl(input.entryId, input.actionPath);

  // 3. Discord DM.
  let discordSent = false;
  if (prefs.discord_enabled && user.discord_id) {
    const result = await sendDiscordDM({
      recipientDiscordId: user.discord_id as string,
      recipientName: user.display_name as string,
      title: input.title,
      body: formatDiscordBody(input.title, input.body, actionUrl),
      actionUrl,
    });
    discordSent = result.ok;
  }

  // 4. Email.
  let emailSent = false;
  if (prefs.email_enabled && user.email) {
    const result = await sendEmail({
      recipientEmail: user.email as string,
      recipientName: user.display_name as string,
      subject: input.title,
      bodyMarkdown: input.body ?? input.title,
      actionUrl,
    });
    emailSent = result.ok;
  }

  // 5. Flip flags on the row we inserted (if any).
  if (notificationId && (discordSent || emailSent)) {
    await supabase
      .from("notifications")
      .update({
        discord_sent: discordSent,
        email_sent: emailSent,
      })
      .eq("id", notificationId);
  }
}

function buildActionUrl(entryId: string | null, actionPath?: string): string {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (actionPath) return `${base}${actionPath}`;
  if (entryId) return `${base}/content?entry=${entryId}`;
  return `${base}/home`;
}

/**
 * Broadcast a notification to every user in a set. Useful for events like
 * "content_submitted" that go to the whole editor pool.
 */
export async function dispatchNotificationBulk(
  userIds: string[],
  base: Omit<DispatchInput, "userId">,
): Promise<void> {
  // Dedupe.
  const uniqueIds = Array.from(new Set(userIds));
  await Promise.all(
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
    .select("in_app_enabled, discord_enabled, email_enabled")
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .maybeSingle();

  if (row) {
    return {
      in_app_enabled: Boolean(row.in_app_enabled),
      discord_enabled: Boolean(row.discord_enabled),
      email_enabled: Boolean(row.email_enabled),
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
      "id, user_id, entry_id, type, title, body, is_read, discord_sent, email_sent, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.onlyUnread) query = query.eq("is_read", false);
  if (filters.type) query = query.eq("type", filters.type);

  const { data } = await query;

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
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
  const { error } = await getSupabaseAdmin()
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
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
    .select("event_type, in_app_enabled, discord_enabled, email_enabled")
    .eq("user_id", userId);

  const stored = new Map<string, ChannelPrefs>();
  for (const row of (data ?? []) as Array<{
    event_type: string;
    in_app_enabled: boolean;
    discord_enabled: boolean;
    email_enabled: boolean;
  }>) {
    stored.set(row.event_type, {
      in_app_enabled: Boolean(row.in_app_enabled),
      discord_enabled: Boolean(row.discord_enabled),
      email_enabled: Boolean(row.email_enabled),
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

export const updatePreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      event_type: z.enum(NOTIFICATION_EVENT_TYPES),
      in_app_enabled: z.boolean(),
      discord_enabled: z.boolean(),
      email_enabled: z.boolean(),
    }),
  ),
});

export async function setPreferencesForUser(
  userId: string,
  prefs: Array<{
    event_type: NotificationEventType;
    in_app_enabled: boolean;
    discord_enabled: boolean;
    email_enabled: boolean;
  }>,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  // Upsert each row — the (user_id, event_type) unique index means we can't
  // batch-replace atomically without delete-then-insert. Delete first for
  // simplicity; the caller already holds the full intended state.
  await supabase
    .from("notification_preferences")
    .delete()
    .eq("user_id", userId);

  if (prefs.length === 0) return true;

  const rows = prefs.map((p) => ({
    user_id: userId,
    event_type: p.event_type,
    in_app_enabled: p.in_app_enabled,
    discord_enabled: p.discord_enabled,
    email_enabled: p.email_enabled,
  }));

  const { error } = await supabase
    .from("notification_preferences")
    .insert(rows);
  return !error;
}
