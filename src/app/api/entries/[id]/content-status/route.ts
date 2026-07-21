import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  submitContent,
  sendToPolishing,
  type TransitionError,
} from "@/lib/entries/status-transitions";
import { createComment } from "@/lib/comments/data";
import { triggerSentToPolishing } from "@/lib/notifications/trigger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }),
  z.object({
    action: z.literal("send_to_polishing"),
    reason: z.string().trim().min(1).max(1000),
  }),
]);

/**
 * PATCH /api/entries/:id/content-status
 *
 * Two allowed actions:
 *   - submit: writer moves from claimed/polishing → submitted
 *   - send_to_polishing: editor moves from submitted → polishing, with
 *     reason. The reason is ALSO posted as a comment in the entry thread
 *     so the writer sees it prominently (not just in the audit trail).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  if (parsed.data.action === "submit") {
    const result = await submitContent(viewer, id);
    if (!result.ok) {
      return errorResponse(
        statusCodeForError(result.error),
        errorMessage(result.error),
      );
    }
    return NextResponse.json({ ok: true });
  }

  // send_to_polishing path — flip the status first, THEN post the system
  // comment. If the transition fails we bail without the comment.
  const transitionResult = await sendToPolishing(viewer, id, parsed.data.reason);
  if (!transitionResult.ok) {
    return errorResponse(
      statusCodeForError(transitionResult.error),
      errorMessage(transitionResult.error),
    );
  }

  // Best-effort comment creation — don't fail the status change if comment
  // insertion has a hiccup.
  await createComment(viewer, id, { body: parsed.data.reason }, {
    systemLabel: "Polishing request",
  });

  // Notify the writer(s) that their article is back for revisions.
  const { data: entryRow } = await getSupabaseAdmin()
    .from("entries")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  await triggerSentToPolishing(
    viewer,
    id,
    (entryRow?.title as string | undefined) ?? "an entry",
    parsed.data.reason,
  );

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
