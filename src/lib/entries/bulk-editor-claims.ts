import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const bulkEditorClaimSchema = z.object({
  entry_ids: z
    .array(z.uuid())
    .min(1)
    .max(25)
    .refine((ids) => new Set(ids).size === ids.length, "Entry IDs must be unique"),
});

export async function bulkClaimEditorEntries(
  actorId: string,
  entryIds: string[],
): Promise<
  | { ok: true; claimed: number }
  | { ok: false; kind: "not_found" | "conflict" | "forbidden" | "invalid" | "database" }
> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "bulk_claim_editor_entries",
    { p_actor_id: actorId, p_entry_ids: entryIds },
  );
  if (!error) return { ok: true, claimed: data ?? 0 };
  if (error.code === "P0002") return { ok: false, kind: "not_found" };
  if (error.code === "P0001" || error.code === "23505") {
    return { ok: false, kind: "conflict" };
  }
  if (error.code === "42501") return { ok: false, kind: "forbidden" };
  if (error.code === "22023") return { ok: false, kind: "invalid" };
  return { ok: false, kind: "database" };
}
