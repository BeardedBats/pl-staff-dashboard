import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listPendingArchiveRequests } from "@/lib/archive-requests/data";

export const dynamic = "force-dynamic";

/** GET /api/archive-requests — pending archive requests (manager+ only). */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const requests = await listPendingArchiveRequests(viewer);
  return NextResponse.json({ requests });
}
