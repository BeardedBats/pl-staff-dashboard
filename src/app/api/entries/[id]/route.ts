import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getEntryById } from "@/lib/entries/queries";
import { updateEntry, updateEntrySchema } from "@/lib/entries/mutations";
import {
  canEditEntryResource,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/entries/:id — full entry detail. */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const entry = await getEntryById(viewer, id);
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  return NextResponse.json({ entry });
}

/** PATCH /api/entries/:id — update fields (non-status). */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const authorization = await loadEntryAuthorizationContext(id);
  if (!authorization) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  if (!canEditEntryResource(viewer, authorization)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ok = await updateEntry(viewer.id, id, parsed.data);
  if (!ok) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  const updated = await getEntryById(viewer, id);
  return NextResponse.json({ entry: updated });
}
