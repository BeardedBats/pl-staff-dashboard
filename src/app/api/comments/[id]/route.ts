import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  deleteComment,
  updateComment,
  updateCommentSchema,
} from "@/lib/comments/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/comments/:id — edit (author only). */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;

  const parsed = await parseJsonBody(request, updateCommentSchema);
  if (!parsed.ok) return parsed.response;

  const result = await updateComment(viewer, id, parsed.data);
  if (!result.ok) {
    return errorResponse(400, result.error);
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/comments/:id — admin+ only. */
export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  const result = await deleteComment(viewer, id);
  if (!result.ok) {
    return errorResponse(400, result.error);
  }
  return NextResponse.json({ ok: true });
}
