import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  emitStructuredLog,
  safeErrorCode,
} from "@/lib/observability/structured-log";

const entryIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(200)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Entry IDs must be unique",
  });

export const bulkEntryUpdateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("archive"),
    entry_ids: entryIdsSchema,
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("unarchive"),
    entry_ids: entryIdsSchema,
  }),
  z.object({
    action: z.literal("set_priority"),
    entry_ids: entryIdsSchema,
    priority: z.boolean(),
  }),
  z.object({
    action: z.literal("change_tier"),
    entry_ids: entryIdsSchema,
    tier_id: z.uuid(),
  }),
]);

export type BulkEntryUpdateInput = z.infer<typeof bulkEntryUpdateSchema>;

export type BulkEntryUpdateResult =
  | { ok: true; updated: number }
  | {
      ok: false;
      kind:
        | "completed_checklist"
        | "not_found"
        | "invalid_reference"
        | "invalid_input"
        | "database";
    };

function rpcPayload(input: BulkEntryUpdateInput): Json {
  switch (input.action) {
    case "archive":
      return { reason: input.reason ?? "Bulk archived" };
    case "unarchive":
      return {};
    case "set_priority":
      return { priority: input.priority };
    case "change_tier":
      return { tier_id: input.tier_id };
  }
}

/** Update entries and their audits/checklists in one database transaction. */
export async function bulkUpdateEntries(
  actorId: string,
  input: BulkEntryUpdateInput,
): Promise<BulkEntryUpdateResult> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "bulk_update_entries",
    {
      p_actor_id: actorId,
      p_entry_ids: input.entry_ids,
      p_action: input.action,
      p_payload: rpcPayload(input),
    },
  );

  if (!error) return { ok: true, updated: data ?? 0 };

  emitStructuredLog({
    level: "error",
    component: "entries",
    event: "entries.bulk_update_failed",
    errorCode: safeErrorCode(error, "database"),
  });
  if (
    error.code === "P0001" &&
    error.message === "completed_checklist_blocks_tier_change"
  ) {
    return { ok: false, kind: "completed_checklist" };
  }
  if (error.code === "P0002") return { ok: false, kind: "not_found" };
  if (error.code === "23503") {
    return { ok: false, kind: "invalid_reference" };
  }
  if (error.code === "22023") return { ok: false, kind: "invalid_input" };
  return { ok: false, kind: "database" };
}
