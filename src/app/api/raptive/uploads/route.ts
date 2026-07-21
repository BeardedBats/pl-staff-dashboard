import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import { listRaptiveUploads } from "@/lib/analytics/raptive";

export const dynamic = "force-dynamic";

/** GET /api/raptive/uploads — upload history visible to EIC/Ops. */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!canViewAnalytics(viewer)) {
    return errorResponse(403, "Forbidden");
  }

  const uploads = await listRaptiveUploads();
  return NextResponse.json({ uploads });
}
