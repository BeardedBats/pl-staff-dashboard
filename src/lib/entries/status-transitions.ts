import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { appendRecentActivity } from "@/lib/entries/recent-activity";
import {
  triggerContentSubmitted,
  triggerEntryPublished,
  triggerEntryScheduled,
} from "@/lib/notifications/trigger";
import type {
  ContentStatus,
  EditorStatus,
  GraphicStatus,
} from "@/lib/entries/queries";
import type { AppSite, CurrentUser } from "@/lib/auth/current-user";

/**
 * Central state machine for the content + editor status tracks.
 *
 * Rules:
 *  - Content track is staff-driven all the way: writer_needed → claim_requested
 *    → claimed → submitted → [polishing ↔ submitted].
 *  - Editor track is staff-driven up to `edited`:
 *      none → ready_for_edit (auto on submit) → edited.
 *    The `scheduled` and `published` states are WP-driven — they can only be
 *    set by the WordPress sync path (see lib/entries/wp-post.ts).
 *  - Moving to `edited` requires the three-track gate: content_status MUST be
 *    `submitted`, and NO graphic_requests may be `flagged`.
 *
 * Every transition records an audit_log row with the old and new values.
 */

export type TransitionError =
  | { kind: "not_found" }
  | { kind: "forbidden"; message: string }
  | { kind: "invalid_transition"; message: string }
  | { kind: "gate_blocked"; message: string }
  | { kind: "db_error"; message: string };

export type TransitionResult =
  | { ok: true }
  | { ok: false; error: TransitionError };

// --------------------------------------------------------------------------
// Content track
// --------------------------------------------------------------------------

/**
 * Writer submits content. Allowed from `claimed` or `polishing`.
 * Side effect: editor_status auto-flips to `ready_for_edit` if it was `none`.
 */
export async function submitContent(
  viewer: CurrentUser,
  entryId: string,
): Promise<TransitionResult> {
  const supabase = getSupabaseAdmin();

  const { data: entry } = await supabase
    .from("entries")
    .select("id, content_status, editor_status")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { ok: false, error: { kind: "not_found" } };

  const currentContent = entry.content_status as ContentStatus;
  if (currentContent !== "claimed" && currentContent !== "polishing") {
    return {
      ok: false,
      error: {
        kind: "invalid_transition",
        message: `Cannot submit from '${currentContent}' — must be 'claimed' or 'polishing'.`,
      },
    };
  }

  // Writer-only action: caller must be the entry's primary author.
  const authorOk = await isEntryAuthor(entryId, viewer.id);
  if (!authorOk) {
    return {
      ok: false,
      error: { kind: "forbidden", message: "Only the assigned writer can submit." },
    };
  }

  const currentEditor = entry.editor_status as EditorStatus;
  const newEditor: EditorStatus =
    currentEditor === "none" ? "ready_for_edit" : currentEditor;

  const { error } = await supabase
    .from("entries")
    .update({
      content_status: "submitted",
      editor_status: newEditor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);
  if (error) return { ok: false, error: { kind: "db_error", message: error.message } };

  await writeAuditRow(entryId, viewer.id, "status_change", "content_status", currentContent, "submitted");
  if (newEditor !== currentEditor) {
    await writeAuditRow(
      entryId,
      viewer.id,
      "status_change",
      "editor_status",
      currentEditor,
      newEditor,
    );
  }

  await appendRecentActivity(entryId, {
    type: "status_change",
    actor_id: viewer.id,
    actor_name: viewer.display_name,
    label: `submitted for edit`,
    at: new Date().toISOString(),
  });

  // Notify the editor pool that there's new content waiting.
  const { data: entryRow } = await supabase
    .from("entries")
    .select("title")
    .eq("id", entryId)
    .maybeSingle();
  await triggerContentSubmitted(
    viewer,
    entryId,
    (entryRow?.title as string | undefined) ?? "an entry",
  );

  return { ok: true };
}

/**
 * Editor (or manager+) sends an entry back to the writer for revisions.
 * Allowed only when content_status = `submitted`. Requires a `reason`
 * string explaining what needs fixing — stored in the audit log until
 * Step 6 introduces the full comment system.
 */
export async function sendToPolishing(
  viewer: CurrentUser,
  entryId: string,
  reason: string,
): Promise<TransitionResult> {
  if (!reason || reason.trim().length === 0) {
    return {
      ok: false,
      error: { kind: "invalid_transition", message: "A reason is required." },
    };
  }
  const supabase = getSupabaseAdmin();

  const { data: entry } = await supabase
    .from("entries")
    .select("content_status")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { ok: false, error: { kind: "not_found" } };

  if ((entry.content_status as ContentStatus) !== "submitted") {
    return {
      ok: false,
      error: {
        kind: "invalid_transition",
        message: "Entries can only be sent to polishing from 'submitted'.",
      },
    };
  }

  // Permission: editor / manager+ / can_publish.
  if (!canEditorAct(viewer)) {
    return {
      ok: false,
      error: {
        kind: "forbidden",
        message: "Only editors and managers can send content back for polishing.",
      },
    };
  }

  const { error } = await supabase
    .from("entries")
    .update({
      content_status: "polishing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);
  if (error) return { ok: false, error: { kind: "db_error", message: error.message } };

  await writeAuditRow(
    entryId,
    viewer.id,
    "status_change",
    "content_status",
    "submitted",
    `polishing: ${reason.trim()}`,
  );

  await appendRecentActivity(entryId, {
    type: "status_change",
    actor_id: viewer.id,
    actor_name: viewer.display_name,
    label: `sent back for polishing: ${reason.trim().slice(0, 100)}`,
    at: new Date().toISOString(),
  });

  return { ok: true };
}

// --------------------------------------------------------------------------
// Editor track
// --------------------------------------------------------------------------

/**
 * Editor claims the edit slot. Allowed when editor_status = `ready_for_edit`
 * and no editor is currently assigned. Creates an entry_editors row.
 */
export async function claimEdit(
  viewer: CurrentUser,
  entryId: string,
): Promise<TransitionResult> {
  if (!canEditorAct(viewer)) {
    return {
      ok: false,
      error: { kind: "forbidden", message: "Editor role required." },
    };
  }
  const supabase = getSupabaseAdmin();

  const { data: entry } = await supabase
    .from("entries")
    .select("editor_status")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { ok: false, error: { kind: "not_found" } };

  if ((entry.editor_status as EditorStatus) !== "ready_for_edit") {
    return {
      ok: false,
      error: {
        kind: "invalid_transition",
        message: "Entry must be 'ready for edit' to claim.",
      },
    };
  }

  // Insert editor. The UNIQUE(entry_id, user_id) constraint makes re-claiming
  // a no-op rather than an error.
  await supabase
    .from("entry_editors")
    .insert({ entry_id: entryId, user_id: viewer.id })
    .select("id");

  await writeAuditRow(entryId, viewer.id, "claim", "editor_track", null, viewer.display_name);

  return { ok: true };
}

/**
 * Editor (or manager+) marks an entry as edited. This is the terminal
 * dashboard-side editor action. From here, scheduling and publishing are
 * controlled by WordPress — the dashboard picks those transitions up via
 * the WP refresh path.
 *
 * Gate: content_status must be `submitted` AND no graphic_requests may be
 * `flagged` (graphics can still be needed/claimed — those just mean "wait",
 * not "block").
 *
 * Actually, per the spec the graphics gate requires all graphic_requests to
 * be `submitted`. We enforce that strictly here.
 */
export async function markEdited(
  viewer: CurrentUser,
  entryId: string,
): Promise<TransitionResult> {
  if (!canEditorAct(viewer)) {
    return {
      ok: false,
      error: { kind: "forbidden", message: "Editor role required." },
    };
  }

  const supabase = getSupabaseAdmin();

  const { data: entry } = await supabase
    .from("entries")
    .select("content_status, editor_status")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { ok: false, error: { kind: "not_found" } };

  const currentContent = entry.content_status as ContentStatus;
  const currentEditor = entry.editor_status as EditorStatus;

  if (currentContent !== "submitted") {
    return {
      ok: false,
      error: {
        kind: "gate_blocked",
        message: `Content is not submitted (currently '${currentContent}').`,
      },
    };
  }
  if (currentEditor !== "ready_for_edit" && currentEditor !== "edited") {
    return {
      ok: false,
      error: {
        kind: "invalid_transition",
        message: `Cannot mark edited from '${currentEditor}'.`,
      },
    };
  }

  // Graphic gate — every graphic_request must be `submitted` (or there can
  // be zero graphic requests for this entry).
  const { data: graphics } = await supabase
    .from("graphic_requests")
    .select("graphic_status")
    .eq("entry_id", entryId);

  const unresolved = ((graphics ?? []) as Array<{
    graphic_status: GraphicStatus;
  }>).filter((g) => g.graphic_status !== "submitted");

  if (unresolved.length > 0) {
    const flaggedCount = unresolved.filter((g) => g.graphic_status === "flagged").length;
    const needsCount = unresolved.filter((g) => g.graphic_status !== "flagged").length;
    const parts: string[] = [];
    if (flaggedCount > 0) parts.push(`${flaggedCount} flagged`);
    if (needsCount > 0) parts.push(`${needsCount} pending`);
    return {
      ok: false,
      error: {
        kind: "gate_blocked",
        message: `Graphics not ready: ${parts.join(", ")}.`,
      },
    };
  }

  if (currentEditor === "edited") {
    // Idempotent — already marked.
    return { ok: true };
  }

  const { error } = await supabase
    .from("entries")
    .update({
      editor_status: "edited",
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);
  if (error) return { ok: false, error: { kind: "db_error", message: error.message } };

  await writeAuditRow(
    entryId,
    viewer.id,
    "status_change",
    "editor_status",
    currentEditor,
    "edited",
  );

  await appendRecentActivity(entryId, {
    type: "status_change",
    actor_id: viewer.id,
    actor_name: viewer.display_name,
    label: `marked as edited — ready to schedule in WordPress`,
    at: new Date().toISOString(),
  });

  return { ok: true };
}

// --------------------------------------------------------------------------
// WP-driven transitions (called from the WP refresh path)
// --------------------------------------------------------------------------

/**
 * Applied when the WP sync path reads the post and finds a new status.
 * Called by lib/entries/wp-post.ts — never by an HTTP handler directly.
 */
export async function applyWpStateToEntry(
  entryId: string,
  systemUserId: string,
  wpState: {
    status: string;
    modified: string | null;
    date: string | null;
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: entry } = await supabase
    .from("entries")
    .select("editor_status, wp_status, published_at")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return;

  const currentEditor = entry.editor_status as EditorStatus;
  const wpStatus = wpState.status;

  // Map WP status → dashboard editor_status (only when it's a forward move).
  let nextEditor: EditorStatus | null = null;
  if (wpStatus === "future" && currentEditor !== "published") {
    nextEditor = "scheduled";
  } else if (wpStatus === "publish" && currentEditor !== "published") {
    nextEditor = "published";
  }

  const updates: Record<string, unknown> = {
    wp_status: wpStatus,
    wp_modified_at: wpState.modified ?? null,
    updated_at: new Date().toISOString(),
  };

  if (nextEditor && nextEditor !== currentEditor) {
    updates.editor_status = nextEditor;
  }
  if (wpStatus === "publish" && !entry.published_at) {
    updates.published_at = wpState.date ?? new Date().toISOString();
  }

  await supabase.from("entries").update(updates).eq("id", entryId);

  if (nextEditor && nextEditor !== currentEditor) {
    await writeAuditRow(
      entryId,
      systemUserId,
      "status_change",
      "editor_status",
      currentEditor,
      `${nextEditor} (via WP sync)`,
    );
    await appendRecentActivity(entryId, {
      type: "status_change",
      actor_id: systemUserId,
      actor_name: "WordPress sync",
      label:
        nextEditor === "published"
          ? "published — article is live"
          : "scheduled in WordPress",
      at: new Date().toISOString(),
    });

    // Fire notifications for scheduled / published transitions.
    const { data: full } = await supabase
      .from("entries")
      .select("title, site")
      .eq("id", entryId)
      .maybeSingle();
    const title = (full?.title as string | undefined) ?? "an entry";
    if (nextEditor === "scheduled") {
      await triggerEntryScheduled(
        entryId,
        title,
        (full?.site as AppSite | undefined) ?? "pl",
      );
    } else if (nextEditor === "published") {
      await triggerEntryPublished(entryId, title);
    }
  }
}

// --------------------------------------------------------------------------
// Shared helpers
// --------------------------------------------------------------------------

export async function writeAuditRow(
  entryId: string,
  userId: string,
  action:
    | "status_change"
    | "field_edit"
    | "claim"
    | "comment"
    | "archive"
    | "graphic_update"
    | "checklist"
    | "assignment"
    | "created"
    | "scheduled",
  fieldName: string | null,
  oldValue: string | null | undefined,
  newValue: string | null | undefined,
): Promise<void> {
  await getSupabaseAdmin().from("audit_log").insert({
    entry_id: entryId,
    user_id: userId,
    action,
    field_name: fieldName,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
  });
}

async function isEntryAuthor(entryId: string, userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("entry_authors")
    .select("id")
    .eq("entry_id", entryId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

function canEditorAct(viewer: CurrentUser): boolean {
  const roles = viewer.roles;
  return (
    roles.includes("editor") ||
    roles.includes("manager") ||
    roles.includes("admin") ||
    roles.includes("eic") ||
    roles.includes("operations")
  );
}
