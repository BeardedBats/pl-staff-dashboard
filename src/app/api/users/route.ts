import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parseSearchParams } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listUsers, type ListUsersFilters } from "@/lib/users/queries";
import { sanitizeUserForViewer } from "@/lib/users/visibility";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  search: z.string().trim().max(200).optional(),
  role: z
    .enum(["writer", "editor", "graphics", "manager", "admin", "eic", "operations"])
    .optional(),
  site: z.enum(["pl", "qb", "both"]).optional(),
  teamId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/users
 *
 * Query params:
 *   - search   Partial match on display_name/email
 *   - role     Filter by role
 *   - site     Filter by site
 *   - teamId   Filter by team membership
 *   - limit    Page size (default 50, max 200)
 *   - offset   Pagination offset
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "Not authenticated");
  }

  const parsed = parseSearchParams(request, querySchema);
  if (!parsed.ok) return parsed.response;
  const filters: ListUsersFilters = {
    search: parsed.data.search || undefined,
    role: parsed.data.role,
    site: parsed.data.site,
    teamId: parsed.data.teamId,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  };

  const result = await listUsers(filters);
  return NextResponse.json({
    ...result,
    users: result.users.map((target) => sanitizeUserForViewer(target, user)),
  });
}
