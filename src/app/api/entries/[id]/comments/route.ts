import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await context.params;
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await createComment(viewer, id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ id: result.id });
}
