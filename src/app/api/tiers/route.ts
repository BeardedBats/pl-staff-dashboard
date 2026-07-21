import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { listTiers } from "@/lib/entries/queries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

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
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}

export async function PATCH(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

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
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const url = new URL(request.url);
  const idFromQuery = url.searchParams.get("id");
  const merged =
    idFromQuery && typeof body === "object" && body !== null && !("id" in body)
      ? { ...(body as Record<string, unknown>), id: idFromQuery }
      : idFromQuery && (body === null || typeof body !== "object")
        ? { id: idFromQuery }
        : body;
  const parsed = deleteSchema.safeParse(merged);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "tier id is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("tier_id", parsed.data.id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Tier is referenced by ${count} entr${count === 1 ? "y" : "ies"}. Reassign them before deleting.`,
      },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("tiers")
    .delete()
    .eq("id", parsed.data.id);
  if (error) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
