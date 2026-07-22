import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import {
  canViewAnalytics,
  getCurrentUser,
} from "@/lib/auth/current-user";
import { getRaptiveLiveStatus } from "@/lib/analytics/raptive-live";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse(401, "Not authenticated");
  if (!canViewAnalytics(viewer)) {
    return errorResponse(403, "Analytics access required");
  }
  return NextResponse.json({ status: await getRaptiveLiveStatus() });
}
