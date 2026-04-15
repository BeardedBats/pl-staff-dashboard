import { NextResponse } from "next/server";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const isSelf = viewer.id === id;
  if (!isSelf && !isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await resyncUserFromWp(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const updated = await getUserById(id);
  return NextResponse.json({ user: updated });
}
