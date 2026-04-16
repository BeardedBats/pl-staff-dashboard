import { NextResponse } from "next/server";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { disconnectGa4 } from "@/lib/analytics/ga4";

export const dynamic = "force-dynamic";

export async function POST() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOperations(viewer)) {
    return NextResponse.json(
      { error: "Only Operations can disconnect GA4" },
      { status: 403 },
    );
  }

  await disconnectGa4();
  return NextResponse.json({ ok: true });
}
