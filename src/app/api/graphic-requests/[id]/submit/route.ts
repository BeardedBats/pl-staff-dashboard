import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getGraphicRequestById } from "@/lib/graphics/data";
import { submitGraphicRequest } from "@/lib/graphics/submit-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/graphic-requests/:id/submit
 *
 * Finalize the graphic — uploads to WP media library and sets as the post's
 * featured image. The request must already have a file uploaded via the
 * upload endpoint. Requires the parent entry to have a wp_post_id (i.e.
 * a claim has been approved).
 */
export async function POST(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  const result = await submitGraphicRequest(viewer, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const fresh = await getGraphicRequestById(viewer, id);
  return NextResponse.json({
    request: fresh,
    wp_media_id: result.wp_media_id,
  });
}
