import { NextResponse } from "next/server";
import { canViewAnalytics, getCurrentUser } from "@/lib/auth/current-user";
import { getGa4Status } from "@/lib/analytics/ga4";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!canViewAnalytics(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = await getGa4Status();
  return NextResponse.json({ status });
}
