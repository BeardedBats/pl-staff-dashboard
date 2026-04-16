import { NextResponse } from "next/server";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await listChecklistItems();
  return NextResponse.json({ items });
}

/** POST /api/settings/checklist-items — create a new item. */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createChecklistItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await createChecklistItem(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ id: result.id });
}
