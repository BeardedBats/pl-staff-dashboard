import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listGraphicRequestVersions } from "@/lib/graphics/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/graphic-requests/:id/versions — authorized immutable history. */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse(401, "Not authenticated");

  const { id } = await context.params;
  const versions = await listGraphicRequestVersions(viewer, id);
  if (!versions) return errorResponse(404, "Request not found");
  return NextResponse.json({ versions });
}
