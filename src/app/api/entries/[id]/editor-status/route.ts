import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  claimEdit,
  markEdited,
  type TransitionError,
} from "@/lib/entries/status-transitions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["claim", "mark_edited"]),
});

/**
 * PATCH /api/entries/:id/editor-status
 *
 *   - claim: editor claims the editing slot
 *   - mark_edited: editor marks the entry as edited (gate check inside)
 *
 * Note: scheduled and published are NOT settable here. Those come from
 * the WordPress refresh path (/api/entries/:id/wp-refresh).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const result =
    parsed.data.action === "claim"
      ? await claimEdit(viewer, id)
      : await markEdited(viewer, id);

  if (!result.ok) {
    return errorResponse(
      statusCodeForError(result.error),
      errorMessage(result.error),
    );
  }
  return NextResponse.json({ ok: true });
}

function statusCodeForError(e: TransitionError): number {
  switch (e.kind) {
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
    case "invalid_transition":
    case "gate_blocked":
      return 409;
    case "db_error":
    default:
      return 500;
  }
}

function errorMessage(e: TransitionError): string {
  if (e.kind === "not_found") return "Entry not found";
  if (e.kind === "db_error") return "Unable to update the entry";
  return "message" in e ? e.message : "Unknown error";
}
