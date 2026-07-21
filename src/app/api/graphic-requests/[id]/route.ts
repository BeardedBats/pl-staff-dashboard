import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  claimGraphicRequest,
  deleteGraphicRequest,
  flagGraphicRequest,
  getGraphicRequestById,
  unclaimGraphicRequest,
  unflagGraphicRequest,
  updateGraphicRequest,
  updateGraphicRequestSchema,
} from "@/lib/graphics/data";
import { deleteStoredGraphic } from "@/lib/graphics/storage";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/graphic-requests/:id */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await context.params;
  const request = await getGraphicRequestById(viewer, id);
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  return NextResponse.json({ request });
}

const patchBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("unclaim") }),
  z.object({
    action: z.literal("flag"),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({ action: z.literal("unflag") }),
  z.object({
    action: z.literal("edit"),
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    urgency_date: z.string().datetime({ offset: true }).nullable().optional(),
  }),
]);

/**
 * PATCH /api/graphic-requests/:id
 *
 * Discriminated union of actions:
 *   - claim / unclaim
 *   - flag (with reason) / unflag
 *   - edit (title/description/urgency_date)
 */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let result: { ok: true } | { ok: false; error: string };

  switch (parsed.data.action) {
    case "claim":
      result = await claimGraphicRequest(viewer, id);
      break;
    case "unclaim":
      result = await unclaimGraphicRequest(viewer, id);
      break;
    case "flag":
      result = await flagGraphicRequest(viewer, id, parsed.data.reason);
      break;
    case "unflag":
      result = await unflagGraphicRequest(viewer, id);
      break;
    case "edit": {
      const editInput = updateGraphicRequestSchema.parse({
        title: parsed.data.title,
        description: parsed.data.description,
        urgency_date: parsed.data.urgency_date,
      });
      result = await updateGraphicRequest(viewer, id, editInput);
      break;
    }
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const fresh = await getGraphicRequestById(viewer, id);
  return NextResponse.json({ request: fresh });
}

/** DELETE /api/graphic-requests/:id — also cleans up the Supabase Storage object. */
export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await deleteGraphicRequest(viewer, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.storage_path) {
    // Best-effort cleanup — don't fail the delete if storage is flaky.
    await deleteStoredGraphic(result.storage_path);
  }

  return NextResponse.json({ ok: true });
}
