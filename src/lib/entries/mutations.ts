import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  emitStructuredLog,
  safeErrorCode,
} from "@/lib/observability/structured-log";

// --------------------------------------------------------------------------
// Create entry
// --------------------------------------------------------------------------

const createEntryFieldsSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(4000).optional().or(z.literal("")),
  site: z.enum(["pl", "qb"]),
  tier_id: z.uuid(),
  priority: z.boolean().optional().default(false),
  publish_date: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  publish_date_precision: z
    .enum(["exact", "loose_date", "loose_time", "none"])
    .optional()
    .default("none"),
  category_id: z.uuid().nullable().optional(),
  series_id: z.uuid().nullable().optional(),
  assignee_user_ids: z
    .array(z.uuid())
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Assignees must be unique",
    })
    .optional()
    .default([]),
  roles_needed: z
    .array(z.enum(["writer", "editor", "graphics"]))
    .optional()
    .default([]),
});

export const createEntrySchema = createEntryFieldsSchema.superRefine(
  (entry, context) => {
    const hasDeadline = Boolean(entry.publish_date);
    const hasPrecision = entry.publish_date_precision !== "none";
    if (hasDeadline !== hasPrecision) {
      context.addIssue({
        code: "custom",
        path: ["publish_date"],
        message: "Publish date and precision must be provided together",
      });
    }
  },
);

export type CreateEntryInput = z.infer<typeof createEntrySchema>;

export const bulkCreateEntriesSchema = z.object({
  entries: z.array(createEntrySchema).min(1).max(25),
});

export type BulkCreateEntriesInput = z.infer<
  typeof bulkCreateEntriesSchema
>["entries"];

export type CreateEntriesResult =
  | { ok: true; entryIds: string[] }
  | {
      ok: false;
      kind: "invalid_reference" | "database";
      error: string;
    };

/**
 * Create a new entry.
 *
 * Steps:
 *   1. Insert the `entries` row (status defaults come from the column defs
 *      in migration 0001 — writer_needed / none).
 *   2. Seed the checklist rows for this tier (so the pre-submission gate
 *      has something to check off).
 *   3. Attach initial authors if assignees were specified.
 *   4. Log the creation in audit_log.
 */
export async function createEntry(
  userId: string,
  input: CreateEntryInput,
): Promise<{ ok: true; entryId: string } | { ok: false; error: string }> {
  const result = await createEntries(userId, [input]);
  if (!result.ok) return result;

  const entryId = result.entryIds[0];
  return entryId
    ? { ok: true, entryId }
    : { ok: false, error: "Failed to create entry" };
}

/** Create one validated batch in a single database transaction. */
export async function createEntries(
  userId: string,
  inputs: BulkCreateEntriesInput,
): Promise<CreateEntriesResult> {
  const payload = inputs.map((input) => ({
    title: input.title,
    description: input.description?.trim() || null,
    site: input.site,
    tier_id: input.tier_id,
    priority: input.priority,
    publish_date: input.publish_date ?? null,
    publish_date_precision: input.publish_date_precision,
    category_id: input.category_id ?? null,
    series_id: input.series_id ?? null,
    assignee_user_ids: input.assignee_user_ids,
  }));

  const { data, error } = await getSupabaseAdmin().rpc(
    "bulk_create_entries",
    {
      p_actor_id: userId,
      p_entries: payload as Json,
    },
  );

  if (error) {
    emitStructuredLog({
      level: "error",
      component: "entries",
      event: "entries.bulk_create_failed",
      errorCode: safeErrorCode(error, "database"),
    });
    if (error.code === "23503") {
      return {
        ok: false,
        kind: "invalid_reference",
        error: "A referenced tier, category, series, or assignee no longer exists",
      };
    }
    return { ok: false, kind: "database", error: "Failed to create entries" };
  }

  const ordered = [...(data ?? [])].sort(
    (a, b) => a.request_index - b.request_index,
  );
  if (ordered.length !== inputs.length) {
    return {
      ok: false,
      kind: "database",
      error: "Failed to create every requested entry",
    };
  }

  return { ok: true, entryIds: ordered.map((row) => row.entry_id) };
}

// --------------------------------------------------------------------------
// Update entry fields (non-status)
// --------------------------------------------------------------------------

export const updateEntrySchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(4000).nullable().optional(),
  tier_id: z.uuid().optional(),
  priority: z.boolean().optional(),
  publish_date: z.string().datetime({ offset: true }).nullable().optional(),
  publish_date_precision: z
    .enum(["exact", "loose_date", "loose_time", "none"])
    .optional(),
  category_id: z.uuid().nullable().optional(),
  series_id: z.uuid().nullable().optional(),
}).superRefine((entry, context) => {
  const changesDate = entry.publish_date !== undefined;
  const changesPrecision = entry.publish_date_precision !== undefined;
  if (changesDate !== changesPrecision) {
    context.addIssue({
      code: "custom",
      path: ["publish_date"],
      message: "Publish date and precision must be updated together",
    });
    return;
  }
  if (changesDate) {
    const hasDeadline = entry.publish_date !== null;
    const hasPrecision = entry.publish_date_precision !== "none";
    if (hasDeadline !== hasPrecision) {
      context.addIssue({
        code: "custom",
        path: ["publish_date"],
        message: "Publish date and precision must describe the same deadline",
      });
    }
  }
});

export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
export type UpdateEntryResult =
  | { ok: true }
  | {
      ok: false;
      kind:
        | "completed_checklist"
        | "not_found"
        | "invalid_reference"
        | "database";
    };

export async function updateEntry(
  userId: string,
  entryId: string,
  input: UpdateEntryInput,
): Promise<UpdateEntryResult> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "update_entry_fields",
    {
      p_actor_id: userId,
      p_entry_id: entryId,
      p_payload: input as Json,
    },
  );
  if (!error && data === true) return { ok: true };
  if (
    error?.code === "P0001" &&
    error.message === "completed_checklist_blocks_tier_change"
  ) {
    return { ok: false, kind: "completed_checklist" };
  }
  if (error?.code === "P0002") return { ok: false, kind: "not_found" };
  if (error?.code === "23503") {
    return { ok: false, kind: "invalid_reference" };
  }
  return { ok: false, kind: "database" };
}

// The archive helpers moved to lib/archive-requests/data.ts in Step 4 so the
// request + approval flows share one code path. The /api/entries/:id/archive
// route uses that module directly.
