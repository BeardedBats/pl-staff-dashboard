import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import {
  createChecklistItem,
  createChecklistItemSchema,
  listChecklistItems,
} from "@/lib/checklist/data";

export const dynamic = "force-dynamic";

/** GET /api/settings/checklist-items — list all items across tiers. */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return errorResponse(403, "Forbidden");
  }

  const items = await listChecklistItems();
  return NextResponse.json({ items });
}

/** POST /api/settings/checklist-items — create a new item. */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isAdminPlusForScope(viewer, "both")) {
    return errorResponse(403, "Forbidden");
  }

  const parsed = await parseJsonBody(request, createChecklistItemSchema);
  if (!parsed.ok) return parsed.response;

  const result = await createChecklistItem(parsed.data);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }
  return NextResponse.json({ id: result.id });
}
