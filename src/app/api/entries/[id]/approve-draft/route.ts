import { NextResponse } from "next/server";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  if (!entry.is_drafted) {
    return NextResponse.json({ ok: true, alreadyApproved: true });
  }

  // Check if viewer is author or admin.
  const isAuthor = entry.created_by === viewer.id;
  if (!isAuthor && !isAdminPlus(viewer)) {
    // Check entry_authors too — the writer might not be the creator in
    // edge cases where the sync assigned a different author.
    const { data: authorRow } = await supabase
      .from("entry_authors")
      .select("id")
      .eq("entry_id", id)
      .eq("user_id", viewer.id)
      .maybeSingle();
    if (!authorRow) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from("entries")
    .update({
      is_drafted: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
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
