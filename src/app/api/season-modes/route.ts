import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listSeasonModes } from "@/lib/season-modes/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const modes = await listSeasonModes();
  return NextResponse.json({ modes });
}
