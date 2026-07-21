import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { resyncUserFromWp } from "@/lib/users/mutations";
import { getUserById } from "@/lib/users/queries";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/users/:id/resync-wp — pull the latest profile from WordPress.
 *
 * Permitted for:
 *   - the user themselves (refreshing their own bio/avatar after updating WP)
 *   - Admin+ (bulk maintenance)
 */
export async function POST(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const isSelf = viewer.id === id;
  const target = await getUserById(id);
  if (!target) {
    return errorResponse(404, "User not found");
  }
  if (!isSelf && !isAdminPlusForScope(viewer, target.wp_site)) {
    return errorResponse(403, "Forbidden");
  }

  const result = await resyncUserFromWp(id);
  if (!result.ok) {
    return errorResponse(502, result.error);
  }

  const updated = await getUserById(id);
  return NextResponse.json({ user: updated });
}
