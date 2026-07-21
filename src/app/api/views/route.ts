import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createView,
  createViewSchema,
  listViewsForUser,
} from "@/lib/views/data";

export const dynamic = "force-dynamic";

/** GET /api/views — list the current user's saved views. */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const views = await listViewsForUser(viewer.id);
  return NextResponse.json({ views });
}

/** POST /api/views — save a new view for the current user. */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const parsed = await parseJsonBody(request, createViewSchema);
  if (!parsed.ok) return parsed.response;

  const result = await createView(viewer.id, parsed.data);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }
  return NextResponse.json({ view_id: result.id });
}
