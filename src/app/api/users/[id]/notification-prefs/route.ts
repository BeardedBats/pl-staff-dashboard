import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { getUserById } from "@/lib/users/queries";
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
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  if (viewer.id !== id) {
    const target = await getUserById(id);
    if (!target || !isAdminPlusForScope(viewer, target.wp_site)) {
      return errorResponse(403, "Forbidden");
    }
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
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  if (viewer.id !== id) {
    const target = await getUserById(id);
    if (!target || !isAdminPlusForScope(viewer, target.wp_site)) {
      return errorResponse(403, "Forbidden");
    }
  }

  const parsed = await parseJsonBody(request, updatePreferencesSchema);
  if (!parsed.ok) return parsed.response;

  const ok = await setPreferencesForUser(id, parsed.data.preferences);
  if (!ok) {
    return errorResponse(500, "Save failed");
  }
  return NextResponse.json({ ok: true });
}
