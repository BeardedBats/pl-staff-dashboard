import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
import {
  listNotificationsForUser,
  markAllRead,
  markBodySchema,
  setReadStatus,
} from "@/lib/notifications/data";
import {
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventType,
} from "@/lib/notifications/defaults";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/users/:id/notifications
 *
 * List notifications for a user. Only the user themselves or admin+ can
 * read them.
 *
 * Query params:
 *   - onlyUnread=true
 *   - type=mention | claim_requested | ...
 *   - limit, offset
 */
export async function GET(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  if (viewer.id !== id && !isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const type =
    typeParam && NOTIFICATION_EVENT_TYPES.includes(typeParam as NotificationEventType)
      ? (typeParam as NotificationEventType)
      : undefined;

  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "50") || 50, 1),
    200,
  );
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0") || 0, 0);

  const result = await listNotificationsForUser(id, {
    onlyUnread: url.searchParams.get("onlyUnread") === "true",
    type,
    limit,
    offset,
  });

  return NextResponse.json(result);
}

const patchBodySchema = z.union([
  markBodySchema,
  z.object({ action: z.literal("mark_all_read") }),
]);

/**
 * PATCH /api/users/:id/notifications
 *
 * Mark a batch as read/unread, or mark everything read with
 * `{ action: 'mark_all_read' }`.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  if (viewer.id !== id && !isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  if ("action" in parsed.data && parsed.data.action === "mark_all_read") {
    const ok = await markAllRead(id);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  if ("ids" in parsed.data) {
    const ok = await setReadStatus(id, parsed.data.ids, parsed.data.is_read);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
