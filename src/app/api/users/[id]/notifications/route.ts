import { NextResponse } from "next/server";
import {
  errorResponse,
  parseJsonBody,
  parseSearchParams,
} from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { getUserById } from "@/lib/users/queries";
import {
  listNotificationsForUser,
  markAllRead,
  markBodySchema,
  setReadStatus,
} from "@/lib/notifications/data";
import {
  NOTIFICATION_EVENT_TYPES,
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
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  if (viewer.id !== id) {
    const target = await getUserById(id);
    if (!target || !isAdminPlusForScope(viewer, target.wp_site)) {
      return errorResponse(403, "Forbidden");
    }
  }

  const parsed = parseSearchParams(
    request,
    z.object({
      type: z.enum(NOTIFICATION_EVENT_TYPES).optional(),
      onlyUnread: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .default(false),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  );
  if (!parsed.ok) return parsed.response;

  try {
    const result = await listNotificationsForUser(id, {
      onlyUnread: parsed.data.onlyUnread,
      type: parsed.data.type,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return NextResponse.json(result);
  } catch {
    return errorResponse(500, "Failed to load notifications");
  }
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
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;
  if (viewer.id !== id) {
    const target = await getUserById(id);
    if (!target || !isAdminPlusForScope(viewer, target.wp_site)) {
      return errorResponse(403, "Forbidden");
    }
  }

  const parsed = await parseJsonBody(request, patchBodySchema);
  if (!parsed.ok) return parsed.response;

  if ("action" in parsed.data && parsed.data.action === "mark_all_read") {
    const ok = await markAllRead(id);
    return ok
      ? NextResponse.json({ ok: true })
      : errorResponse(500, "Failed to update notifications");
  }

  if ("ids" in parsed.data) {
    const ok = await setReadStatus(id, parsed.data.ids, parsed.data.is_read);
    return ok
      ? NextResponse.json({ ok: true })
      : errorResponse(500, "Failed to update notifications");
  }

  return errorResponse(400, "Unknown action");
}
