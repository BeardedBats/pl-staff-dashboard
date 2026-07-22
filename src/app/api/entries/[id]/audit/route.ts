import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canViewEntryResource,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/entries/:id/audit
 *
 * Returns the full audit trail for an entry, newest first. Joins the users
 * table so each row has the actor's display name + avatar.
 */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const authorization = await loadEntryAuthorizationContext(id);
  if (!authorization || !canViewEntryResource(viewer, authorization)) {
    return errorResponse(404, "Entry not found");
  }
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, action, field_name, old_value, new_value, created_at, users!audit_log_user_id_fkey(id, display_name, avatar_url)",
    )
    .eq("entry_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return errorResponse(500, "Unable to load entry history");
  }

  const events = ((data ?? []) as Array<{
    id: string;
    action: string;
    field_name: string | null;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
    users?: {
      id: string;
      display_name: string;
      avatar_url: string | null;
    } | null;
  }>).map((row) => ({
    id: row.id,
    action: row.action,
    field_name: row.field_name,
    old_value: row.old_value,
    new_value: row.new_value,
    created_at: row.created_at,
    actor: row.users
      ? {
          id: row.users.id,
          display_name: row.users.display_name,
          avatar_url: row.users.avatar_url,
        }
      : null,
  }));

  return NextResponse.json({ events });
}
