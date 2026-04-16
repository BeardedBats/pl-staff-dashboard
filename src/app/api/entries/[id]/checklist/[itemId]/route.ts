import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canUserEditChecklist,
  setChecklistItemCompleted,
} from "@/lib/checklist/data";
import { writeAuditRow } from "@/lib/entries/status-transitions";

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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: entryId, itemId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const allowed = await canUserEditChecklist(entryId, viewer.id, viewer.roles);
  if (!allowed) {
    return NextResponse.json(
      {
        error: "Only writers, editors, and admins on this entry can edit the checklist",
      },
      { status: 403 },
    );
  }

  const result = await setChecklistItemCompleted(
    entryId,
    itemId,
    viewer.id,
    parsed.data.is_completed,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
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
