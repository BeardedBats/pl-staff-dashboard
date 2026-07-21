import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { setCanPublish } from "@/lib/users/mutations";
import { getUserById } from "@/lib/users/queries";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({ can_publish: z.boolean() });

/** PATCH /api/users/:id/publish — Admin+ only. Grant or revoke publish rights. */
export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  const target = await getUserById(id);
  if (!target) {
    return errorResponse(404, "User not found");
  }
  if (!isAdminPlusForScope(viewer, target.wp_site)) {
    return errorResponse(403, "Forbidden");
  }

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const ok = await setCanPublish(id, parsed.data.can_publish);
  if (!ok) {
    return errorResponse(500, "Update failed");
  }

  return NextResponse.json({ ok: true });
}
