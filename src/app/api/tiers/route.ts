import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiError,
  errorResponse,
  parseJsonBody,
  readJsonBody,
  validateData,
} from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { listTiers } from "@/lib/entries/queries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const tiers = await listTiers();
  return NextResponse.json({ tiers });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  sort_order: z.number().int().min(0).max(999).optional(),
});

const updateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40).optional(),
  label: z.string().trim().min(1).max(80).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

const deleteSchema = z.object({
  id: z.uuid(),
});

export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return errorResponse(403, "Admin only");
  }

  const parsed = await parseJsonBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = getSupabaseAdmin();
  let sortOrder = parsed.data.sort_order;
  if (sortOrder === undefined) {
    const { data: maxRow } = await supabase
      .from("tiers")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = ((maxRow?.sort_order as number | null) ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from("tiers")
    .insert({
      name: parsed.data.name,
      label: parsed.data.label,
      sort_order: sortOrder,
    })
    .select("id")
    .single();
  if (error || !data) {
    return errorResponse(500, "Create failed");
  }
  return NextResponse.json({ id: data.id });
}

export async function PATCH(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return errorResponse(403, "Admin only");
  }

  const parsed = await parseJsonBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;

  const { id, name, label, sort_order } = parsed.data;
  const updates: { name?: string; label?: string; sort_order?: number } = {};
  if (name !== undefined) updates.name = name;
  if (label !== undefined) updates.label = label;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await getSupabaseAdmin()
    .from("tiers")
    .update(updates)
    .eq("id", id);
  if (error) {
    return errorResponse(500, "Update failed");
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return errorResponse(403, "Admin only");
  }

  const bodyResult = await readJsonBody(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const url = new URL(request.url);
  const idFromQuery = url.searchParams.get("id");
  const merged =
    idFromQuery && typeof body === "object" && body !== null && !("id" in body)
      ? { ...(body as Record<string, unknown>), id: idFromQuery }
      : idFromQuery && (body === null || typeof body !== "object")
        ? { id: idFromQuery }
        : body;
  const parsed = validateData(merged, deleteSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("tier_id", parsed.data.id);

  if ((count ?? 0) > 0) {
    return apiError(
      409,
      "CONFLICT",
      `Tier is referenced by ${count} entr${count === 1 ? "y" : "ies"}. Reassign them before deleting.`,
    );
  }

  const { error } = await supabase
    .from("tiers")
    .delete()
    .eq("id", parsed.data.id);
  if (error) {
    return errorResponse(500, "Delete failed");
  }
  return NextResponse.json({ ok: true });
}
