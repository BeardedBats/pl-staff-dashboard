import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listSeasonModes } from "@/lib/season-modes/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const modes = await listSeasonModes();
  return NextResponse.json({ modes });
}
