import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  submitContent,
  sendToPolishing,
  type TransitionError,
} from "@/lib/entries/status-transitions";
import { createComment } from "@/lib/comments/data";

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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.action === "submit") {
    const result = await submitContent(viewer, id);
    if (!result.ok) {
      return NextResponse.json(
        { error: errorMessage(result.error) },
        { status: statusCodeForError(result.error) },
      );
    }
    return NextResponse.json({ ok: true });
  }

  // send_to_polishing path — flip the status first, THEN post the system
  // comment. If the transition fails we bail without the comment.
  const transitionResult = await sendToPolishing(viewer, id, parsed.data.reason);
  if (!transitionResult.ok) {
    return NextResponse.json(
      { error: errorMessage(transitionResult.error) },
      { status: statusCodeForError(transitionResult.error) },
    );
  }

  // Best-effort comment creation — don't fail the status change if comment
  // insertion has a hiccup.
  await createComment(viewer, id, { body: parsed.data.reason }, {
    systemLabel: "Polishing request",
  });

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
  return "message" in e ? e.message : "Unknown error";
}
