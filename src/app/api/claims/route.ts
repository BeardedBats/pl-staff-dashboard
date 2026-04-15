import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const claims = await listPendingClaims(viewer);
  return NextResponse.json({ claims });
}
