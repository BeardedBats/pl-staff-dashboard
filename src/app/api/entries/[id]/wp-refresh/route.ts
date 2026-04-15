import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { refreshWpStatusForEntry } from "@/lib/entries/wp-post";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/entries/:id/wp-refresh
 *
 * Fetch the entry's WordPress post state and mirror it to the dashboard.
 * Updates editor_status to 'scheduled' if WP says 'future' or to 'published'
 * if WP says 'publish'. Also refreshes wp_status and published_at.
 *
 * Any authenticated user can trigger a refresh on any entry.
 */
export async function POST(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await refreshWpStatusForEntry(id, viewer.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    wp_status: result.wpStatus,
    unchanged: result.unchanged,
  });
}
