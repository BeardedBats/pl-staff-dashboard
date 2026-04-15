import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const result =
    parsed.data.action === "claim"
      ? await claimEdit(viewer, id)
      : await markEdited(viewer, id);

  if (!result.ok) {
    return NextResponse.json(
      { error: errorMessage(result.error) },
      { status: statusCodeForError(result.error) },
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
  return "message" in e ? e.message : "Unknown error";
}
