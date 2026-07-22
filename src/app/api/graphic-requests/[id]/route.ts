import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  claimGraphicRequest,
  deleteGraphicRequest,
  flagGraphicRequest,
  getGraphicRequestById,
  submitGraphicForReview,
  unclaimGraphicRequest,
  unflagGraphicRequest,
  updateGraphicRequest,
  updateGraphicRequestSchema,
  type GraphicMutationErrorKind,
} from "@/lib/graphics/data";
import { deleteStoredGraphics } from "@/lib/graphics/storage";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const mutationStatus: Record<GraphicMutationErrorKind, number> = {
  validation: 400,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  database: 500,
};

/** GET /api/graphic-requests/:id */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  const request = await getGraphicRequestById(viewer, id);
  if (!request) {
    return errorResponse(404, "Request not found");
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
  z.object({ action: z.literal("submit_review") }),
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
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;

  const parsed = await parseJsonBody(request, patchBodySchema);
  if (!parsed.ok) return parsed.response;

  let result:
    | { ok: true }
    | { ok: false; kind: GraphicMutationErrorKind; error: string };

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
    case "submit_review":
      result = await submitGraphicForReview(viewer, id);
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
    return errorResponse(mutationStatus[result.kind], result.error);
  }

  const fresh = await getGraphicRequestById(viewer, id);
  return NextResponse.json({ request: fresh });
}

/** DELETE /api/graphic-requests/:id — also cleans up the Supabase Storage object. */
export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  const result = await deleteGraphicRequest(viewer, id);
  if (!result.ok) {
    return errorResponse(mutationStatus[result.kind], result.error);
  }

  // Best-effort cleanup — the DB request/version rows are already gone, so a
  // storage outage may leave inaccessible objects but cannot resurrect data.
  await deleteStoredGraphics(result.storage_paths);

  return NextResponse.json({ ok: true });
}
