import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth/current-user";
import { writeAuditRow } from "@/lib/entries/status-transitions";

export type ArchiveRequestRecord = {
  id: string;
  entry_id: string;
  requested_by: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
  // Joined
  entry_title: string;
  requester_name: string;
  requester_avatar: string | null;
};

export const archiveRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export async function createArchiveRequest(
  viewer: CurrentUser,
  entryId: string,
  reason: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("archive_requests")
    .insert({
      entry_id: entryId,
      requested_by: viewer.id,
      reason,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Failed to file request" };

  await writeAuditRow(
    entryId,
    viewer.id,
    "archive",
    "archive_request",
    null,
    `Requested: ${reason.slice(0, 100)}`,
  );

  return { ok: true, id: data.id as string };
}

export async function listPendingArchiveRequests(
  viewer: CurrentUser,
): Promise<ArchiveRequestRecord[]> {
  if (!isManagerPlus(viewer)) return [];
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("archive_requests")
    .select(
      "id, entry_id, requested_by, reason, status, resolved_by, created_at, resolved_at, " +
        "entries!inner(title), " +
        "users!archive_requests_requested_by_fkey(display_name, avatar_url)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Array<{
    id: string;
    entry_id: string;
    requested_by: string;
    reason: string;
    status: "pending" | "approved" | "denied";
    resolved_by: string | null;
    created_at: string;
    resolved_at: string | null;
    entries: { title: string };
    users?: { display_name: string; avatar_url: string | null } | null;
  }>).map((row) => ({
    id: row.id,
    entry_id: row.entry_id,
    requested_by: row.requested_by,
    reason: row.reason,
    status: row.status,
    resolved_by: row.resolved_by,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    entry_title: row.entries.title,
    requester_name: row.users?.display_name ?? "Unknown",
    requester_avatar: row.users?.avatar_url ?? null,
  }));
}

export async function approveArchiveRequest(
  approver: CurrentUser,
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isManagerPlus(approver)) {
    return { ok: false, error: "Only managers can approve archive requests" };
  }
  const supabase = getSupabaseAdmin();

  const { data: request } = await supabase
    .from("archive_requests")
    .select("id, entry_id, reason, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { ok: false, error: "Request not found" };
  if (request.status !== "pending") {
    return { ok: false, error: `Already ${request.status}` };
  }

  await supabase
    .from("archive_requests")
    .update({
      status: "approved",
      resolved_by: approver.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  await supabase
    .from("entries")
    .update({
      is_archived: true,
      archive_reason: request.reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.entry_id);

  await writeAuditRow(
    request.entry_id as string,
    approver.id,
    "archive",
    "is_archived",
    "false",
    `true (approved: ${request.reason})`,
  );

  return { ok: true };
}

export async function denyArchiveRequest(
  approver: CurrentUser,
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isManagerPlus(approver)) {
    return { ok: false, error: "Only managers can deny archive requests" };
  }
  const supabase = getSupabaseAdmin();

  const { data: request } = await supabase
    .from("archive_requests")
    .select("id, entry_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { ok: false, error: "Request not found" };
  if (request.status !== "pending") {
    return { ok: false, error: `Already ${request.status}` };
  }

  await supabase
    .from("archive_requests")
    .update({
      status: "denied",
      resolved_by: approver.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  await writeAuditRow(
    request.entry_id as string,
    approver.id,
    "archive",
    "archive_request",
    "pending",
    "denied",
  );

  return { ok: true };
}

function isManagerPlus(viewer: CurrentUser): boolean {
  return viewer.roles.some((r) =>
    ["manager", "admin", "eic", "operations"].includes(r),
  );
}
