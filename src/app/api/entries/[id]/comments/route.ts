import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canViewEntryResource,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";
import {
  createComment,
  createCommentSchema,
  listCommentsForEntry,
} from "@/lib/comments/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/entries/:id/comments
 *
 * Returns the threaded comment list for an entry. Oldest first, with
 * replies nested under their parents.
 */
export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  const authorization = await loadEntryAuthorizationContext(id);
  if (!authorization || !canViewEntryResource(viewer, authorization)) {
    return errorResponse(404, "Entry not found");
  }
  const comments = await listCommentsForEntry(id);
  return NextResponse.json({ comments });
}

/**
 * POST /api/entries/:id/comments
 *
 * Create a comment or reply. Body can contain @Display Name mentions which
 * are parsed and stored on the row; mentioned users receive a `mention`
 * notification.
 */
export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  const authorization = await loadEntryAuthorizationContext(id);
  if (!authorization || !canViewEntryResource(viewer, authorization)) {
    return errorResponse(404, "Entry not found");
  }

  const parsed = await parseJsonBody(request, createCommentSchema);
  if (!parsed.ok) return parsed.response;

  const result = await createComment(viewer, id, parsed.data);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }

  return NextResponse.json({ id: result.id });
}
