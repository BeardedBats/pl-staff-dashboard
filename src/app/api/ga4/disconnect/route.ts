import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { disconnectGa4 } from "@/lib/analytics/ga4";

export const dynamic = "force-dynamic";

export async function POST() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isOperations(viewer)) {
    return errorResponse(403, "Only Operations can disconnect GA4");
  }

  await disconnectGa4();
  return NextResponse.json({ ok: true });
}
