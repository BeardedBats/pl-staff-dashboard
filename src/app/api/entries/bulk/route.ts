import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canViewEntryResource,
  isManagerPlusForSite,
  loadEntryAuthorizationContexts,
} from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditRow } from "@/lib/entries/status-transitions";

export const dynamic = "force-dynamic";

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("archive"),
    entry_ids: z.array(z.string().uuid()).min(1).max(200),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("unarchive"),
    entry_ids: z.array(z.string().uuid()).min(1).max(200),
  }),
  z.object({
    action: z.literal("set_priority"),
    entry_ids: z.array(z.string().uuid()).min(1).max(200),
    priority: z.boolean(),
  }),
  z.object({
    action: z.literal("change_tier"),
    entry_ids: z.array(z.string().uuid()).min(1).max(200),
    tier_id: z.string().uuid(),
  }),
]);

type BulkBody = z.infer<typeof bulkSchema>;

/**
 * POST /api/entries/bulk
 *
 * Apply a single simple field update to many entries at once. Manager+ only.
 * Status-changing bulk actions are NOT supported here on purpose — those
 * fire notifications / WP sync / audit cascades that need per-entry
 * validation. Use the per-entry endpoints for those.
 *
 * Supported actions:
 *   - archive / unarchive   → flips is_archived, writes audit per entry
 *   - set_priority          → flips priority flag
 *   - change_tier           → re-assigns tier_id (useful for reclassification)
 */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input: BulkBody = parsed.data;
  const uniqueEntryIds = Array.from(new Set(input.entry_ids));
  const authorization = await loadEntryAuthorizationContexts(uniqueEntryIds);
  if (authorization.size !== uniqueEntryIds.length) {
    return NextResponse.json(
      { error: "One or more entries were not found" },
      { status: 404 },
    );
  }
  if (
    Array.from(authorization.values()).some(
      (entry) =>
        !canViewEntryResource(viewer, entry) ||
        !isManagerPlusForSite(viewer, entry.site),
    )
  ) {
    return NextResponse.json(
      { error: "Manager+ access is required for every affected entry site" },
      { status: 403 },
    );
  }
  const supabase = getSupabaseAdmin();

  // Build the update payload and audit annotations up front.
  let updatePayload: Record<string, unknown>;
  let auditAction: "archive" | "field_edit";
  let auditField: string;
  let auditOld: string;
  let auditNew: string;

  switch (input.action) {
    case "archive":
      updatePayload = {
        is_archived: true,
        archive_reason: input.reason ?? "Bulk archived",
      };
      auditAction = "archive";
      auditField = "is_archived";
      auditOld = "false";
      auditNew = "true";
      break;
    case "unarchive":
      updatePayload = { is_archived: false, archive_reason: null };
      auditAction = "archive";
      auditField = "is_archived";
      auditOld = "true";
      auditNew = "false";
      break;
    case "set_priority":
      updatePayload = { priority: input.priority };
      auditAction = "field_edit";
      auditField = "priority";
      auditOld = String(!input.priority);
      auditNew = String(input.priority);
      break;
    case "change_tier":
      updatePayload = { tier_id: input.tier_id };
      auditAction = "field_edit";
      auditField = "tier_id";
      auditOld = "";
      auditNew = input.tier_id;
      break;
  }

  const { error } = await supabase
    .from("entries")
    .update(updatePayload)
    .in("id", input.entry_ids);

  if (error) {
    return NextResponse.json(
      { error: `Bulk update failed: ${error.message}` },
      { status: 500 },
    );
  }

  // Audit each row individually so the trail matches per-entry history
  await Promise.all(
    input.entry_ids.map((id) =>
      writeAuditRow(id, viewer.id, auditAction, auditField, auditOld, auditNew),
    ),
  );

  return NextResponse.json({
    ok: true,
    updated: input.entry_ids.length,
  });
}
