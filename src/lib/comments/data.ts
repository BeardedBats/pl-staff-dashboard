import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditRow } from "@/lib/entries/status-transitions";
import { appendRecentActivity } from "@/lib/entries/recent-activity";
import { resolveMentions, type ResolvedMention } from "./mention-parser";
import type { CurrentUser } from "@/lib/auth/current-user";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type CommentRecord = {
  id: string;
  entry_id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  mentions: Array<{ user_id: string; display_name: string }>;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  author_name: string;
  author_avatar: string | null;
  /** Present only on the root messages — replies are flattened into this. */
  replies?: CommentRecord[];
};

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  parent_id: z.uuid().nullable().optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

// --------------------------------------------------------------------------
// List
// --------------------------------------------------------------------------

/**
 * List all comments on an entry, threaded. Parents come first with their
 * replies nested underneath. Ordered oldest-first within each thread.
 */
export async function listCommentsForEntry(
  entryId: string,
): Promise<CommentRecord[]> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("comments")
    .select(
      "id, entry_id, user_id, body, parent_id, mentions, created_at, updated_at, users!comments_user_id_fkey(id, display_name, avatar_url)",
    )
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true });

  type Row = {
    id: string;
    entry_id: string;
    user_id: string;
    body: string;
    parent_id: string | null;
    mentions: Array<{ user_id: string; display_name: string }> | null;
    created_at: string;
    updated_at: string;
    users?: { id: string; display_name: string; avatar_url: string | null } | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  const byId = new Map<string, CommentRecord>();
  const roots: CommentRecord[] = [];

  for (const row of rows) {
    const record: CommentRecord = {
      id: row.id,
      entry_id: row.entry_id,
      user_id: row.user_id,
      body: row.body,
      parent_id: row.parent_id,
      mentions: row.mentions ?? [],
      is_edited: row.updated_at !== row.created_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author_name: row.users?.display_name ?? "Unknown",
      author_avatar: row.users?.avatar_url ?? null,
      replies: [],
    };
    byId.set(record.id, record);
  }

  for (const record of byId.values()) {
    if (record.parent_id && byId.has(record.parent_id)) {
      const parent = byId.get(record.parent_id)!;
      parent.replies = parent.replies ?? [];
      parent.replies.push(record);
    } else {
      roots.push(record);
    }
  }

  return roots;
}

// --------------------------------------------------------------------------
// Create
// --------------------------------------------------------------------------

/**
 * Create a new comment. Parses @mentions, resolves them to user IDs,
 * stores them on the row, and emits in-app notification rows for each
 * mentioned user (Step 7 will surface those as Discord/email).
 *
 * Also updates the entry's `recent_activity` cache.
 */
export async function createComment(
  viewer: CurrentUser,
  entryId: string,
  input: CreateCommentInput,
  opts: {
    /** Prefix prepended to the body for display (e.g. "Polishing request"). */
    systemLabel?: string;
  } = {},
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  // Parse @mentions before insert so we can store them atomically.
  const resolvedMentions = await resolveMentions(input.body);
  const mentionsJson = resolvedMentions.map((m) => ({
    user_id: m.user_id,
    display_name: m.display_name,
  }));

  const bodyToStore = opts.systemLabel
    ? `**${opts.systemLabel}**\n\n${input.body.trim()}`
    : input.body.trim();

  const { data, error } = await supabase
    .from("comments")
    .insert({
      entry_id: entryId,
      user_id: viewer.id,
      body: bodyToStore,
      parent_id: input.parent_id ?? null,
      mentions: mentionsJson,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Failed to create comment" };
  }

  const commentId = data.id as string;

  // Audit row.
  await writeAuditRow(
    entryId,
    viewer.id,
    "comment",
    null,
    null,
    `${viewer.display_name}: ${bodyToStore.slice(0, 120)}`,
  );

  // Recent activity cache.
  await appendRecentActivity(entryId, {
    type: "comment",
    actor_id: viewer.id,
    actor_name: viewer.display_name,
    label: bodyToStore.slice(0, 160),
    at: new Date().toISOString(),
  });

  // Emit notifications for each mentioned user (skip self-mentions).
  if (resolvedMentions.length > 0) {
    await createMentionNotifications(
      entryId,
      viewer,
      resolvedMentions,
      bodyToStore,
    );
  }

  return { ok: true, id: commentId };
}

async function createMentionNotifications(
  entryId: string,
  viewer: CurrentUser,
  mentions: ResolvedMention[],
  body: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const rows = mentions
    .filter((m) => m.user_id !== viewer.id)
    .map((m) => ({
      user_id: m.user_id,
      entry_id: entryId,
      type: "mention" as const,
      title: `${viewer.display_name} mentioned you`,
      body: body.slice(0, 200),
      is_read: false,
    }));

  if (rows.length > 0) {
    await supabase.from("notifications").insert(rows);
  }
}

// --------------------------------------------------------------------------
// Edit (author-only)
// --------------------------------------------------------------------------

export async function updateComment(
  viewer: CurrentUser,
  commentId: string,
  input: z.infer<typeof updateCommentSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("comments")
    .select("id, entry_id, user_id, body")
    .eq("id", commentId)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Comment not found" };

  if (existing.user_id !== viewer.id) {
    return { ok: false, error: "You can only edit your own comments" };
  }

  // Re-parse mentions — editing could add or remove @mentions.
  const resolvedMentions = await resolveMentions(input.body);
  const mentionsJson = resolvedMentions.map((m) => ({
    user_id: m.user_id,
    display_name: m.display_name,
  }));

  const { error } = await supabase
    .from("comments")
    .update({
      body: input.body.trim(),
      mentions: mentionsJson,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commentId);

  if (error) return { ok: false, error: "Failed to update comment" };

  await writeAuditRow(
    existing.entry_id as string,
    viewer.id,
    "comment",
    "edit",
    (existing.body as string).slice(0, 120),
    input.body.slice(0, 120),
  );

  return { ok: true };
}

// --------------------------------------------------------------------------
// Delete (admin+ only)
// --------------------------------------------------------------------------

export async function deleteComment(
  viewer: CurrentUser,
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    !viewer.roles.some((r) =>
      ["admin", "eic", "operations"].includes(r),
    )
  ) {
    return { ok: false, error: "Only admin+ can delete comments" };
  }
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("comments")
    .select("id, entry_id, user_id, body")
    .eq("id", commentId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Comment not found" };

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId);
  if (error) return { ok: false, error: "Failed to delete comment" };

  await writeAuditRow(
    existing.entry_id as string,
    viewer.id,
    "comment",
    "delete",
    (existing.body as string).slice(0, 120),
    null,
  );

  return { ok: true };
}
