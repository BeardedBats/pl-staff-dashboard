import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { approveClaim, denyClaim } from "@/lib/claims/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["approve", "deny"]),
});

/** PATCH /api/claims/:id — approve or deny (manager+ only). */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const result =
    parsed.data.action === "approve"
      ? await approveClaim(viewer, id)
      : await denyClaim(viewer, id);

  if (!result.ok) {
    return errorResponse(400, result.error);
  }
  return NextResponse.json({ ok: true });
}
