import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  isAdminPlusForSite,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditRow } from "@/lib/entries/status-transitions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/entries/:id/approve-draft
 *
 * Flip a WP-sync drafted entry from is_drafted=true to is_drafted=false,
 * making it visible to the full team. Only the original author or an
 * admin+ can approve.
 */
export async function POST(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const supabase = getSupabaseAdmin();

  // Load the entry and check authorship.
  const { data: entry } = await supabase
    .from("entries")
    .select("id, is_drafted, created_by")
    .eq("id", id)
    .maybeSingle();

  if (!entry) {
    return errorResponse(404, "Entry not found");
  }
  if (!entry.is_drafted) {
    return NextResponse.json({ ok: true, alreadyApproved: true });
  }

  const authorization = await loadEntryAuthorizationContext(id);
  const isAuthor =
    entry.created_by === viewer.id ||
    Boolean(authorization?.authorIds.has(viewer.id));
  const isSiteAdmin = authorization
    ? isAdminPlusForSite(viewer, authorization.site)
    : false;
  if (!isAuthor && !isSiteAdmin) {
    return errorResponse(403, "Forbidden");
  }

  const { error } = await supabase
    .from("entries")
    .update({
      is_drafted: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return errorResponse(500, "Update failed");
  }

  await writeAuditRow(
    id,
    viewer.id,
    "field_edit",
    "is_drafted",
    "true",
    "false (approved by author)",
  );

  return NextResponse.json({ ok: true });
}
