import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canUserEditChecklist,
  setChecklistItemCompleted,
} from "@/lib/checklist/data";
import { writeAuditRow } from "@/lib/entries/status-transitions";
import {
  canViewEntryResource,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

const bodySchema = z.object({
  is_completed: z.boolean(),
});

/**
 * PATCH /api/entries/:id/checklist/:itemId
 *
 * Tick or untick a single checklist item for an entry. Permitted for the
 * entry's primary author, any assigned editor, or admin+.
 *
 * :itemId here is the `checklist_items.id` (the template item), not the
 * `entry_checklist` row. The helper upserts on `(entry_id, checklist_item_id)`.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id: entryId, itemId } = await context.params;
  const authorization = await loadEntryAuthorizationContext(entryId);
  if (!authorization || !canViewEntryResource(viewer, authorization)) {
    return errorResponse(404, "Entry not found");
  }

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const allowed = await canUserEditChecklist(entryId, viewer);
  if (!allowed) {
    return errorResponse(
      403,
      "Only writers, editors, and admins on this entry can edit the checklist",
    );
  }

  const result = await setChecklistItemCompleted(
    entryId,
    itemId,
    viewer.id,
    parsed.data.is_completed,
  );
  if (!result.ok) {
    return errorResponse(500, result.error);
  }

  await writeAuditRow(
    entryId,
    viewer.id,
    "checklist",
    "entry_checklist",
    null,
    parsed.data.is_completed ? "checked" : "unchecked",
  );

  return NextResponse.json({ ok: true });
}
