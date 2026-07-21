import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!isAdminPlusForScope(viewer, target.wp_site)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  if (
    parsed.data.roles.some(
      (assignment) => !isAdminPlusForScope(viewer, assignment.site),
    )
  ) {
    return NextResponse.json(
      { error: "Forbidden: role assignment exceeds your site authority" },
      { status: 403 },
    );
  }

  const result = await setUserRoles(id, parsed.data.roles);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const updated = await getUserById(id);
  return NextResponse.json({ user: updated });
}
