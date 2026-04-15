import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditRow } from "@/lib/entries/status-transitions";
import {
  triggerGraphicFlagged,
  triggerGraphicRequested,
} from "@/lib/notifications/trigger";
import type { AppSite, CurrentUser } from "@/lib/auth/current-user";
import type { GraphicStatus } from "@/lib/entries/queries";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type GraphicRequestRecord = {
  id: string;
  entry_id: string;
  entry_title: string;
  entry_site: AppSite;
  entry_publish_date: string | null;
  entry_wp_post_id: number | null;
  title: string;
  description: string | null;
  urgency_date: string | null;
  graphic_status: GraphicStatus;
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_by_avatar: string | null;
  created_by: string | null;
  created_by_name: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string | null;
  wp_media_id: number | null;
  flag_reason: string | null;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

export const createGraphicRequestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  urgency_date: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
});

export type CreateGraphicRequestInput = z.infer<
  typeof createGraphicRequestSchema
>;

export const updateGraphicRequestSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  urgency_date: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
});

// --------------------------------------------------------------------------
// Queries
// --------------------------------------------------------------------------

/** List graphic requests with optional status + entry filters. */
export async function listGraphicRequests(filters: {
  status?: GraphicStatus;
  entryId?: string;
  site?: AppSite;
  mine?: boolean;
  userId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<GraphicRequestRecord[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("graphic_requests")
    .select(
      `id, entry_id, title, description, urgency_date, graphic_status,
       claimed_by, created_by, file_url, file_name, file_size, mime_type,
       storage_path, wp_media_id, flag_reason, is_featured, created_at, updated_at,
       entries!inner(id, title, site, publish_date, wp_post_id, is_archived)`,
    )
    .order("urgency_date", { ascending: true, nullsFirst: false });

  if (filters.status) query = query.eq("graphic_status", filters.status);
  if (filters.entryId) query = query.eq("entry_id", filters.entryId);
  if (filters.mine && filters.userId) {
    query = query.eq("claimed_by", filters.userId);
  }
  if (filters.limit) {
    const offset = filters.offset ?? 0;
    query = query.range(offset, offset + filters.limit - 1);
  }

  const { data } = await query;

  const rows = ((data ?? []) as unknown as Array<{
    id: string;
    entry_id: string;
    title: string;
    description: string | null;
    urgency_date: string | null;
    graphic_status: GraphicStatus;
    claimed_by: string | null;
    created_by: string | null;
    file_url: string | null;
    file_name: string | null;
    file_size: number | null;
    mime_type: string | null;
    storage_path: string | null;
    wp_media_id: number | null;
    flag_reason: string | null;
    is_featured: boolean;
    created_at: string;
    updated_at: string;
    entries: {
      id: string;
      title: string;
      site: AppSite;
      publish_date: string | null;
      wp_post_id: number | null;
      is_archived: boolean;
    };
  }>).filter((row) => !row.entries.is_archived); // hide graphics on archived entries

  // Post-filter by site (Supabase nested filters are awkward).
  const siteFiltered = filters.site
    ? rows.filter(
        (r) => r.entries.site === filters.site || filters.site === "both",
      )
    : rows;

  if (siteFiltered.length === 0) return [];

  // Hydrate claimed_by + created_by user names in one batch.
  const userIds = Array.from(
    new Set(
      siteFiltered
        .flatMap((r) => [r.claimed_by, r.created_by])
        .filter((v): v is string => Boolean(v)),
    ),
  );

  const userMap = new Map<
    string,
    { display_name: string; avatar_url: string | null }
  >();

  if (userIds.length > 0) {
    const { data: userRows } = await supabase
      .from("users")
      .select("id, display_name, avatar_url")
      .in("id", userIds);
    for (const u of (userRows ?? []) as Array<{
      id: string;
      display_name: string;
      avatar_url: string | null;
    }>) {
      userMap.set(u.id, {
        display_name: u.display_name,
        avatar_url: u.avatar_url,
      });
    }
  }

  return siteFiltered.map((r) => {
    const claimer = r.claimed_by ? userMap.get(r.claimed_by) : undefined;
    const creator = r.created_by ? userMap.get(r.created_by) : undefined;
    return {
      id: r.id,
      entry_id: r.entry_id,
      entry_title: r.entries.title,
      entry_site: r.entries.site,
      entry_publish_date: r.entries.publish_date,
      entry_wp_post_id: r.entries.wp_post_id,
      title: r.title,
      description: r.description,
      urgency_date: r.urgency_date,
      graphic_status: r.graphic_status,
      claimed_by: r.claimed_by,
      claimed_by_name: claimer?.display_name ?? null,
      claimed_by_avatar: claimer?.avatar_url ?? null,
      created_by: r.created_by,
      created_by_name: creator?.display_name ?? null,
      file_url: r.file_url,
      file_name: r.file_name,
      file_size: r.file_size,
      mime_type: r.mime_type,
      storage_path: r.storage_path,
      wp_media_id: r.wp_media_id,
      flag_reason: r.flag_reason,
      is_featured: Boolean(r.is_featured),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
}

/** Fetch a single graphic request with hydrated user names. */
export async function getGraphicRequestById(
  id: string,
): Promise<GraphicRequestRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("graphic_requests")
    .select(
      `id, entry_id, title, description, urgency_date, graphic_status,
       claimed_by, created_by, file_url, file_name, file_size, mime_type,
       storage_path, wp_media_id, flag_reason, is_featured, created_at, updated_at,
       entries!inner(id, title, site, publish_date, wp_post_id, is_archived)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as {
    id: string;
    entry_id: string;
    title: string;
    description: string | null;
    urgency_date: string | null;
    graphic_status: GraphicStatus;
    claimed_by: string | null;
    created_by: string | null;
    file_url: string | null;
    file_name: string | null;
    file_size: number | null;
    mime_type: string | null;
    storage_path: string | null;
    wp_media_id: number | null;
    flag_reason: string | null;
    is_featured: boolean;
    created_at: string;
    updated_at: string;
    entries: {
      id: string;
      title: string;
      site: AppSite;
      publish_date: string | null;
      wp_post_id: number | null;
      is_archived: boolean;
    };
  };

  // Hydrate users.
  const userIds = [row.claimed_by, row.created_by].filter(
    (v): v is string => Boolean(v),
  );
  const userMap = new Map<
    string,
    { display_name: string; avatar_url: string | null }
  >();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, display_name, avatar_url")
      .in("id", userIds);
    for (const u of (users ?? []) as Array<{
      id: string;
      display_name: string;
      avatar_url: string | null;
    }>) {
      userMap.set(u.id, {
        display_name: u.display_name,
        avatar_url: u.avatar_url,
      });
    }
  }

  const claimer = row.claimed_by ? userMap.get(row.claimed_by) : undefined;
  const creator = row.created_by ? userMap.get(row.created_by) : undefined;

  return {
    id: row.id,
    entry_id: row.entry_id,
    entry_title: row.entries.title,
    entry_site: row.entries.site,
    entry_publish_date: row.entries.publish_date,
    entry_wp_post_id: row.entries.wp_post_id,
    title: row.title,
    description: row.description,
    urgency_date: row.urgency_date,
    graphic_status: row.graphic_status,
    claimed_by: row.claimed_by,
    claimed_by_name: claimer?.display_name ?? null,
    claimed_by_avatar: claimer?.avatar_url ?? null,
    created_by: row.created_by,
    created_by_name: creator?.display_name ?? null,
    file_url: row.file_url,
    file_name: row.file_name,
    file_size: row.file_size,
    mime_type: row.mime_type,
    storage_path: row.storage_path,
    wp_media_id: row.wp_media_id,
    flag_reason: row.flag_reason,
    is_featured: Boolean(row.is_featured),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --------------------------------------------------------------------------
// Mutations
// --------------------------------------------------------------------------

export async function createGraphicRequest(
  viewer: CurrentUser,
  entryId: string,
  input: CreateGraphicRequestInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  // Verify the entry exists.
  const { data: entry } = await supabase
    .from("entries")
    .select("id, title")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { ok: false, error: "Entry not found" };

  const { data, error } = await supabase
    .from("graphic_requests")
    .insert({
      entry_id: entryId,
      title: input.title,
      description: input.description?.trim() || null,
      urgency_date: input.urgency_date ?? null,
      created_by: viewer.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Create failed" };
  }

  await writeAuditRow(
    entryId,
    viewer.id,
    "graphic_update",
    "graphic_request",
    null,
    `Requested: ${input.title}`,
  );

  await triggerGraphicRequested(
    viewer,
    entryId,
    entry.title as string,
    input.title,
  );

  return { ok: true, id: data.id as string };
}

export async function claimGraphicRequest(
  viewer: CurrentUser,
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: req } = await supabase
    .from("graphic_requests")
    .select("id, entry_id, graphic_status, claimed_by, title")
    .eq("id", requestId)
    .maybeSingle();

  if (!req) return { ok: false, error: "Request not found" };

  if (req.graphic_status !== "needed") {
    return {
      ok: false,
      error: `Request is already ${req.graphic_status}`,
    };
  }

  const { error } = await supabase
    .from("graphic_requests")
    .update({
      graphic_status: "claimed",
      claimed_by: viewer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { ok: false, error: "Update failed" };

  await writeAuditRow(
    req.entry_id as string,
    viewer.id,
    "graphic_update",
    "graphic_request",
    "needed",
    `claimed by ${viewer.display_name}: ${req.title}`,
  );

  return { ok: true };
}

export async function unclaimGraphicRequest(
  viewer: CurrentUser,
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: req } = await supabase
    .from("graphic_requests")
    .select("id, entry_id, claimed_by, title")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };

  // Only the claimer or an admin+ can unclaim.
  if (
    req.claimed_by !== viewer.id &&
    !viewer.roles.some((r) => ["admin", "eic", "operations"].includes(r))
  ) {
    return { ok: false, error: "Only the claimer can release this request" };
  }

  const { error } = await supabase
    .from("graphic_requests")
    .update({
      graphic_status: "needed",
      claimed_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { ok: false, error: "Update failed" };

  await writeAuditRow(
    req.entry_id as string,
    viewer.id,
    "graphic_update",
    "graphic_request",
    "claimed",
    `unclaimed: ${req.title}`,
  );

  return { ok: true };
}

export async function flagGraphicRequest(
  viewer: CurrentUser,
  requestId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!reason.trim()) {
    return { ok: false, error: "A reason is required" };
  }
  const supabase = getSupabaseAdmin();

  const { data: req } = await supabase
    .from("graphic_requests")
    .select("id, entry_id, title, graphic_status, claimed_by")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };

  const { error } = await supabase
    .from("graphic_requests")
    .update({
      graphic_status: "flagged",
      flag_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { ok: false, error: "Update failed" };

  await writeAuditRow(
    req.entry_id as string,
    viewer.id,
    "graphic_update",
    "graphic_request",
    req.graphic_status as string,
    `flagged: ${reason.trim().slice(0, 120)}`,
  );

  // Notify the artist who claimed this graphic (or the whole graphics
  // team if nobody's claimed it yet).
  const { data: parentEntry } = await supabase
    .from("entries")
    .select("title")
    .eq("id", req.entry_id as string)
    .maybeSingle();

  await triggerGraphicFlagged(
    viewer,
    req.entry_id as string,
    (parentEntry?.title as string | undefined) ?? "an entry",
    req.title as string,
    reason.trim(),
    (req.claimed_by as string | null) ?? null,
  );

  return { ok: true };
}

export async function unflagGraphicRequest(
  viewer: CurrentUser,
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: req } = await supabase
    .from("graphic_requests")
    .select("id, entry_id, title, claimed_by")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };

  // Return to 'claimed' if there's still a claimer, otherwise 'needed'.
  const nextStatus: GraphicStatus = req.claimed_by ? "claimed" : "needed";

  const { error } = await supabase
    .from("graphic_requests")
    .update({
      graphic_status: nextStatus,
      flag_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { ok: false, error: "Update failed" };

  await writeAuditRow(
    req.entry_id as string,
    viewer.id,
    "graphic_update",
    "graphic_request",
    "flagged",
    `unflagged: ${req.title}`,
  );

  return { ok: true };
}

export async function updateGraphicRequest(
  viewer: CurrentUser,
  requestId: string,
  input: z.infer<typeof updateGraphicRequestSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: req } = await supabase
    .from("graphic_requests")
    .select("id, entry_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };

  const { error } = await supabase
    .from("graphic_requests")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { ok: false, error: "Update failed" };

  await writeAuditRow(
    req.entry_id as string,
    viewer.id,
    "graphic_update",
    "graphic_request",
    null,
    "edited",
  );

  return { ok: true };
}

export async function deleteGraphicRequest(
  viewer: CurrentUser,
  requestId: string,
): Promise<{ ok: true; storage_path: string | null } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data: req } = await supabase
    .from("graphic_requests")
    .select("id, entry_id, title, storage_path, created_by")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };

  // Only the creator or admin+ can delete.
  if (
    req.created_by !== viewer.id &&
    !viewer.roles.some((r) => ["admin", "eic", "operations"].includes(r))
  ) {
    return { ok: false, error: "Only the creator or an admin can delete" };
  }

  const { error } = await supabase
    .from("graphic_requests")
    .delete()
    .eq("id", requestId);

  if (error) return { ok: false, error: "Delete failed" };

  await writeAuditRow(
    req.entry_id as string,
    viewer.id,
    "graphic_update",
    "graphic_request",
    null,
    `deleted: ${req.title}`,
  );

  return { ok: true, storage_path: (req.storage_path as string | null) ?? null };
}
