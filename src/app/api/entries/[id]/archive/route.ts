import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createArchiveRequest } from "@/lib/archive-requests/data";
import { writeAuditRow } from "@/lib/entries/status-transitions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

/**
 * POST /api/entries/:id/archive
 *
 * Admin+ archives directly — flips is_archived = true and writes the audit
 * row. Everyone else files a pending archive_request that a manager resolves
 * via /api/archive-requests/:id.
 */
export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const reason = parsed.data.reason;
  const direct = isAdminPlus(viewer);

  if (direct) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("entries")
      .update({
        is_archived: true,
        archive_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: "Archive failed" }, { status: 500 });
    }
    await writeAuditRow(id, viewer.id, "archive", "is_archived", "false", `true (${reason})`);
    return NextResponse.json({ ok: true, direct: true });
  }

  const result = await createArchiveRequest(viewer, id, reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    direct: false,
    request_id: result.id,
  });
}
