import { NextResponse } from "next/server";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
import {
  getPreferencesForUser,
  setPreferencesForUser,
  updatePreferencesSchema,
} from "@/lib/notifications/data";
import type { AppRole } from "@/lib/auth/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/users/:id/notification-prefs
 *
 * Returns the full preferences matrix (every event type × every channel)
 * merging any stored rows with role-based defaults.
 */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await context.params;
  if (viewer.id !== id && !isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: roleRows } = await getSupabaseAdmin()
    .from("user_roles")
    .select("role")
    .eq("user_id", id);
  const roles = ((roleRows ?? []) as Array<{ role: AppRole }>).map(
    (r) => r.role,
  );

  const preferences = await getPreferencesForUser(id, roles);
  return NextResponse.json({ preferences });
}

/**
 * PATCH /api/users/:id/notification-prefs
 *
 * Replace the full preference set. Body: `{ preferences: [...] }`.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await context.params;
  if (viewer.id !== id && !isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updatePreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ok = await setPreferencesForUser(id, parsed.data.preferences);
  if (!ok) {
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
