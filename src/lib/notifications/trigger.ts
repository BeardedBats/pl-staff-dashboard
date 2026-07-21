import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  dispatchNotification,
  dispatchNotificationBulk,
} from "./data";
import type { AppRole, AppSite, CurrentUser } from "@/lib/auth/current-user";

/**
 * High-level notification triggers. Each function knows:
 *   - which event type to emit
 *   - who the audience is
 *   - how to phrase the title + body
 *
 * Callers elsewhere (comments, claims, status-transitions, graphics) just
 * invoke the appropriate trigger and move on. In-app preference resolution
 * and durable dispatch live underneath.
 *
 * All triggers are best-effort — they never throw or block the transition
 * that fired them. Delivery errors get logged and the caller proceeds.
 */

// --------------------------------------------------------------------------
// Comment @mention
// --------------------------------------------------------------------------

export async function triggerMention(
  actor: CurrentUser,
  entryId: string,
  entryTitle: string,
  mentionedUserIds: string[],
  commentBody: string,
): Promise<void> {
  try {
    const recipients = mentionedUserIds.filter((id) => id !== actor.id);
    if (recipients.length === 0) return;

    await dispatchNotificationBulk(recipients, {
      entryId,
      type: "mention",
      title: `${actor.display_name} mentioned you in "${entryTitle}"`,
      body: commentBody.slice(0, 240),
    });
  } catch (err) {
    console.error("[notifications] triggerMention failed:", err);
  }
}

// --------------------------------------------------------------------------
// Claim workflow
// --------------------------------------------------------------------------

/** Writer filed a new claim → notify team manager(s). */
export async function triggerClaimRequested(
  actor: CurrentUser,
  entryId: string,
  entryTitle: string,
): Promise<void> {
  try {
    const recipients = await usersWithRoles(["manager", "admin", "eic", "operations"]);
    await dispatchNotificationBulk(
      recipients.filter((id) => id !== actor.id),
      {
        entryId,
        type: "claim_requested",
        title: `${actor.display_name} wants to write "${entryTitle}"`,
        body: "Pending in your manager inbox.",
      },
    );
  } catch (err) {
    console.error("[notifications] triggerClaimRequested failed:", err);
  }
}

/** Claim approved or denied → notify the original claimer. */
export async function triggerClaimResolved(
  actor: CurrentUser,
  claimerUserId: string,
  entryId: string,
  entryTitle: string,
  approved: boolean,
): Promise<void> {
  if (claimerUserId === actor.id) return; // auto-approval self-loop
  try {
    await dispatchNotification({
      userId: claimerUserId,
      entryId,
      type: "claim_resolved",
      title: approved
        ? `Your claim on "${entryTitle}" was approved`
        : `Your claim on "${entryTitle}" was denied`,
      body: approved
        ? `Head to WordPress to start writing — the draft is ready.`
        : `You can try claiming a different entry or contact ${actor.display_name}.`,
    });
  } catch (err) {
    console.error("[notifications] triggerClaimResolved failed:", err);
  }
}

// --------------------------------------------------------------------------
// Content pipeline
// --------------------------------------------------------------------------

/** Content was submitted → notify the editor pool. */
export async function triggerContentSubmitted(
  actor: CurrentUser,
  entryId: string,
  entryTitle: string,
): Promise<void> {
  try {
    const recipients = await usersWithRoles([
      "editor",
      "manager",
      "admin",
      "eic",
      "operations",
    ]);
    await dispatchNotificationBulk(
      recipients.filter((id) => id !== actor.id),
      {
        entryId,
        type: "content_submitted",
        title: `"${entryTitle}" is ready for edit`,
        body: `Submitted by ${actor.display_name}.`,
      },
    );
  } catch (err) {
    console.error("[notifications] triggerContentSubmitted failed:", err);
  }
}

/** Sent back to polishing → notify the writer(s). */
export async function triggerSentToPolishing(
  actor: CurrentUser,
  entryId: string,
  entryTitle: string,
  reason: string,
): Promise<void> {
  try {
    const writerIds = await authorsForEntry(entryId);
    await dispatchNotificationBulk(
      writerIds.filter((id) => id !== actor.id),
      {
        entryId,
        type: "sent_to_polishing",
        title: `"${entryTitle}" needs revisions`,
        body: `${actor.display_name}: ${reason.slice(0, 220)}`,
      },
    );
  } catch (err) {
    console.error("[notifications] triggerSentToPolishing failed:", err);
  }
}

// --------------------------------------------------------------------------
// Graphics
// --------------------------------------------------------------------------

/** Graphic request created → notify the graphics team. */
export async function triggerGraphicRequested(
  actor: CurrentUser,
  entryId: string,
  entryTitle: string,
  requestTitle: string,
): Promise<void> {
  try {
    const recipients = await usersWithRoles(["graphics", "admin", "eic", "operations"]);
    await dispatchNotificationBulk(
      recipients.filter((id) => id !== actor.id),
      {
        entryId,
        type: "graphic_requested",
        title: `New graphic request: "${requestTitle}"`,
        body: `For "${entryTitle}". ${actor.display_name} is asking.`,
      },
    );
  } catch (err) {
    console.error("[notifications] triggerGraphicRequested failed:", err);
  }
}

/** Graphic submitted to WP → notify the entry creator + writers. */
export async function triggerGraphicSubmitted(
  actor: CurrentUser,
  entryId: string,
  entryTitle: string,
  requestTitle: string,
): Promise<void> {
  try {
    const authorIds = await authorsForEntry(entryId);
    const creatorId = await creatorForEntry(entryId);
    const recipients = Array.from(
      new Set([creatorId, ...authorIds].filter((id): id is string => Boolean(id))),
    );
    await dispatchNotificationBulk(
      recipients.filter((id) => id !== actor.id),
      {
        entryId,
        type: "graphic_submitted",
        title: `Graphic "${requestTitle}" is live`,
        body: `${actor.display_name} set it as the featured image on "${entryTitle}".`,
      },
    );
  } catch (err) {
    console.error("[notifications] triggerGraphicSubmitted failed:", err);
  }
}

/** Graphic flagged → notify the original claimant (or graphics team if none). */
export async function triggerGraphicFlagged(
  actor: CurrentUser,
  entryId: string,
  entryTitle: string,
  requestTitle: string,
  reason: string,
  claimedBy: string | null,
): Promise<void> {
  try {
    const recipients = claimedBy
      ? [claimedBy]
      : await usersWithRoles(["graphics", "admin", "eic", "operations"]);
    await dispatchNotificationBulk(
      recipients.filter((id) => id !== actor.id),
      {
        entryId,
        type: "graphic_flagged",
        title: `Graphic "${requestTitle}" was flagged`,
        body: `${actor.display_name} on "${entryTitle}": ${reason.slice(0, 200)}`,
      },
    );
  } catch (err) {
    console.error("[notifications] triggerGraphicFlagged failed:", err);
  }
}

// --------------------------------------------------------------------------
// Archive requests
// --------------------------------------------------------------------------

export async function triggerArchiveRequested(
  actor: CurrentUser,
  entryId: string,
  entryTitle: string,
  reason: string,
): Promise<void> {
  try {
    const recipients = await usersWithRoles(["manager", "admin", "eic", "operations"]);
    await dispatchNotificationBulk(
      recipients.filter((id) => id !== actor.id),
      {
        entryId,
        type: "archive_requested",
        title: `${actor.display_name} wants to archive "${entryTitle}"`,
        body: reason.slice(0, 200),
      },
    );
  } catch (err) {
    console.error("[notifications] triggerArchiveRequested failed:", err);
  }
}

// --------------------------------------------------------------------------
// WP-sync driven
// --------------------------------------------------------------------------

export async function triggerEntryScheduled(
  entryId: string,
  entryTitle: string,
  site: AppSite,
): Promise<void> {
  try {
    const authorIds = await authorsForEntry(entryId);
    await dispatchNotificationBulk(authorIds, {
      entryId,
      type: "entry_scheduled",
      title: `"${entryTitle}" is scheduled`,
      body: `${site.toUpperCase()} picked it up — expect it to publish at the scheduled time.`,
    });
  } catch (err) {
    console.error("[notifications] triggerEntryScheduled failed:", err);
  }
}

export async function triggerEntryPublished(
  entryId: string,
  entryTitle: string,
): Promise<void> {
  try {
    const authorIds = await authorsForEntry(entryId);
    await dispatchNotificationBulk(authorIds, {
      entryId,
      type: "entry_published",
      title: `"${entryTitle}" is live`,
      body: `The article is now published on the site.`,
    });
  } catch (err) {
    console.error("[notifications] triggerEntryPublished failed:", err);
  }
}

// --------------------------------------------------------------------------
// Lookup helpers
// --------------------------------------------------------------------------

async function usersWithRoles(roles: AppRole[]): Promise<string[]> {
  const { data } = await getSupabaseAdmin()
    .from("user_roles")
    .select("user_id")
    .in("role", roles);
  return Array.from(
    new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)),
  );
}

async function authorsForEntry(entryId: string): Promise<string[]> {
  const { data } = await getSupabaseAdmin()
    .from("entry_authors")
    .select("user_id")
    .eq("entry_id", entryId);
  return ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
}

async function creatorForEntry(entryId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("entries")
    .select("created_by")
    .eq("id", entryId)
    .maybeSingle();
  return (data?.created_by as string | null) ?? null;
}
