import { NextResponse } from "next/server";
import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import { listRaptiveUploads } from "@/lib/analytics/raptive";

export const dynamic = "force-dynamic";

/** GET /api/raptive/uploads — upload history visible to EIC/Ops. */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canViewAnalytics(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uploads = await listRaptiveUploads();
  return NextResponse.json({ uploads });
}
