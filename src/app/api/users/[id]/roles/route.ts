import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import {
  setUserRoles,
  roleAssignmentSchema,
} from "@/lib/users/mutations";
import { getUserById } from "@/lib/users/queries";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  roles: z.array(roleAssignmentSchema),
});

/**
 * PATCH /api/users/:id/roles — Admin+ only. Replaces the user's entire role
 * set with the supplied array. Pass an empty array to strip all roles.
 */
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
  if (
    parsed.data.roles.some(
      (assignment) => !isAdminPlusForScope(viewer, assignment.site),
    )
  ) {
    return errorResponse(
      403,
      "Forbidden: role assignment exceeds your site authority",
    );
  }

  const result = await setUserRoles(id, parsed.data.roles);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }

  const updated = await getUserById(id);
  return NextResponse.json({ user: updated });
}
