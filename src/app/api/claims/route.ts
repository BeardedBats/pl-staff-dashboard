import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listPendingClaims } from "@/lib/claims/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/claims — list pending claims (manager+ only).
 * Approver inbox used by the home page.
 */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const claims = await listPendingClaims(viewer);
  return NextResponse.json({ claims });
}
