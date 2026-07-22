import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { discoverRaptiveSites } from "@/lib/analytics/raptive-live";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse(401, "Not authenticated");
  if (!isOperations(viewer)) {
    return errorResponse(403, "Only Operations can configure Raptive");
  }
  try {
    return NextResponse.json({ sites: await discoverRaptiveSites() });
  } catch {
    return errorResponse(502, "Raptive sites are temporarily unavailable");
  }
}
