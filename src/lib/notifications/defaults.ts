/**
 * Pure constants + helpers — safe to import from both server and client
 * components. No `server-only` guard here.
 */

import type { AppRole } from "@/lib/auth/current-user";

/**
 * Canonical list of notification event types that the dashboard can emit.
 * Matches the CHECK constraint on notifications.type.
 */
export const NOTIFICATION_EVENT_TYPES = [
  "new_claimable",       // A new unclaimed entry appeared that matches your role
  "claim_requested",     // A writer filed a claim request (team manager sees this)
  "claim_resolved",      // Your claim was approved/denied
  "content_submitted",   // An editor-relevant entry is ready to edit
  "sent_to_polishing",   // Your article was sent back with a reason
  "graphic_requested",   // A new graphic request landed (graphics team)
  "graphic_submitted",   // A graphic was finalized + set as featured image
  "graphic_flagged",     // A submitted graphic was flagged with a fix reason
  "deadline_approaching",// An entry deadline is close + no writer yet (cron)
  "entry_scheduled",     // Entry's editor_status flipped to `scheduled` via WP
  "entry_published",     // Entry's editor_status flipped to `published` via WP
  "mention",             // You were @mentioned in a comment
  "archive_requested",   // Manager sees a new archive request
  "unclaimed_slot",      // Configurable alert about unclaimed recurring slots
  "priority_flagged",    // An entry was flagged as priority
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export type ChannelPrefs = {
  in_app_enabled: boolean;
};

// --------------------------------------------------------------------------
// Role-based defaults
//
// Every staff role gets sensible defaults for the event types they care
// about. Users can override in /settings → Notifications.
//
// Defaults follow Nick's "mentioned users + direct action targets" rule:
// The dashboard currently supports in-app delivery only. External channels
// are intentionally absent until a real adapter and operational ownership
// exist, so preferences can never claim a message was sent elsewhere.
// --------------------------------------------------------------------------

const ON: ChannelPrefs = { in_app_enabled: true };
const OFF: ChannelPrefs = { in_app_enabled: false };

type DefaultsMatrix = Partial<Record<NotificationEventType, ChannelPrefs>>;

const WRITER_DEFAULTS: DefaultsMatrix = {
  new_claimable: ON,
  claim_resolved: ON,
  sent_to_polishing: ON,
  mention: ON,
  entry_scheduled: ON,
  entry_published: ON,
  priority_flagged: ON,
};

const EDITOR_DEFAULTS: DefaultsMatrix = {
  ...WRITER_DEFAULTS,
  content_submitted: ON,
  claim_requested: ON,
  deadline_approaching: ON,
};

const GRAPHICS_DEFAULTS: DefaultsMatrix = {
  graphic_requested: ON,
  graphic_flagged: ON,
  mention: ON,
};

const MANAGER_DEFAULTS: DefaultsMatrix = {
  ...EDITOR_DEFAULTS,
  claim_requested: ON,
  archive_requested: ON,
  unclaimed_slot: ON,
};

const ADMIN_DEFAULTS: DefaultsMatrix = {
  new_claimable: ON,
  claim_requested: ON,
  claim_resolved: ON,
  content_submitted: ON,
  sent_to_polishing: ON,
  graphic_requested: ON,
  graphic_submitted: ON,
  graphic_flagged: ON,
  deadline_approaching: ON,
  entry_scheduled: ON,
  entry_published: ON,
  mention: ON,
  archive_requested: ON,
  unclaimed_slot: ON,
  priority_flagged: ON,
};

const ROLE_DEFAULTS: Record<AppRole, DefaultsMatrix> = {
  writer: WRITER_DEFAULTS,
  editor: EDITOR_DEFAULTS,
  graphics: GRAPHICS_DEFAULTS,
  manager: MANAGER_DEFAULTS,
  admin: ADMIN_DEFAULTS,
  eic: ADMIN_DEFAULTS,
  operations: ADMIN_DEFAULTS,
};

/**
 * Events that are ALWAYS direct-targeted at a specific user. These fire
 * in-app regardless of role assignment — even a brand-new user with no
 * roles yet gets notified when they're @mentioned or their claim is
 * approved. Otherwise a fresh staff member would silently lose all
 * their mentions until an admin assigned them a role.
 */
const FLOOR_IN_APP: Partial<Record<NotificationEventType, true>> = {
  mention: true,
  claim_resolved: true,
  sent_to_polishing: true,
  graphic_flagged: true,
};

/**
 * Merge the defaults for every role a user holds.
 * "Any role says ON" means the in-app event is enabled.
 *
 * A floor is applied at the end: direct-targeted events always have
 * in_app_enabled = true regardless of whether any role explicitly enabled
 * them, so users without roles still receive mentions.
 */
export function buildDefaultPreferences(
  userRoles: AppRole[],
): Record<NotificationEventType, ChannelPrefs> {
  const merged: Record<NotificationEventType, ChannelPrefs> = {} as Record<
    NotificationEventType,
    ChannelPrefs
  >;

  for (const type of NOTIFICATION_EVENT_TYPES) {
    merged[type] = { ...OFF };
  }

  for (const role of userRoles) {
    const roleDefaults = ROLE_DEFAULTS[role];
    for (const type of NOTIFICATION_EVENT_TYPES) {
      const rolePref = roleDefaults[type];
      if (!rolePref) continue;
      merged[type] = {
        in_app_enabled: merged[type].in_app_enabled || rolePref.in_app_enabled,
      };
    }
  }

  // Apply the direct-event floor.
  for (const type of NOTIFICATION_EVENT_TYPES) {
    if (FLOOR_IN_APP[type]) {
      merged[type] = { ...merged[type], in_app_enabled: true };
    }
  }

  return merged;
}

/** Human-readable label for an event type (used in the preferences grid). */
export const EVENT_TYPE_LABELS: Record<NotificationEventType, string> = {
  new_claimable: "New claimable entry appears",
  claim_requested: "A writer requests a claim",
  claim_resolved: "Your claim is approved or denied",
  content_submitted: "Content is submitted for editing",
  sent_to_polishing: "Your article is sent back for polishing",
  graphic_requested: "A graphic request is filed",
  graphic_submitted: "A graphic is finalized",
  graphic_flagged: "A graphic is flagged",
  deadline_approaching: "A deadline is approaching",
  entry_scheduled: "Entry is scheduled in WordPress",
  entry_published: "Entry is published",
  mention: "You are @mentioned in a comment",
  archive_requested: "An archive is requested",
  unclaimed_slot: "A recurring slot goes unclaimed",
  priority_flagged: "An entry is flagged as priority",
};

/** Short category groupings for the preferences UI. */
export const EVENT_TYPE_GROUPS: Array<{
  label: string;
  types: NotificationEventType[];
}> = [
  {
    label: "Your work",
    types: ["mention", "claim_resolved", "sent_to_polishing", "graphic_flagged"],
  },
  {
    label: "Pipeline",
    types: [
      "new_claimable",
      "claim_requested",
      "content_submitted",
      "graphic_requested",
      "graphic_submitted",
    ],
  },
  {
    label: "Scheduling",
    types: [
      "deadline_approaching",
      "entry_scheduled",
      "entry_published",
      "unclaimed_slot",
    ],
  },
  {
    label: "Admin",
    types: ["archive_requested", "priority_flagged"],
  },
];
