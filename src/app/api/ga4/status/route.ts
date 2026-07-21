import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import { getGa4Status } from "@/lib/analytics/ga4";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!canViewAnalytics(viewer)) {
    return errorResponse(403, "Forbidden");
  }

  const status = await getGa4Status();
  return NextResponse.json({ status });
}
