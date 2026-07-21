import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canViewEntryResource,
  isAdminPlusForSite,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";
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
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const authorization = await loadEntryAuthorizationContext(id);
  if (!authorization) {
    return errorResponse(404, "Entry not found");
  }
  if (!canViewEntryResource(viewer, authorization)) {
    return errorResponse(404, "Entry not found");
  }

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const reason = parsed.data.reason;
  const direct = isAdminPlusForSite(viewer, authorization.site);

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
      return errorResponse(500, "Archive failed");
    }
    await writeAuditRow(id, viewer.id, "archive", "is_archived", "false", `true (${reason})`);
    return NextResponse.json({ ok: true, direct: true });
  }

  const result = await createArchiveRequest(viewer, id, reason);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }
  return NextResponse.json({
    ok: true,
    direct: false,
    request_id: result.id,
  });
}
