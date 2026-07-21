import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listPendingArchiveRequests } from "@/lib/archive-requests/data";

export const dynamic = "force-dynamic";

/** GET /api/archive-requests — pending archive requests (manager+ only). */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const requests = await listPendingArchiveRequests(viewer);
  return NextResponse.json({ requests });
}
