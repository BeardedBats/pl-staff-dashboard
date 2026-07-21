import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listUsers, type ListUsersFilters } from "@/lib/users/queries";
import type { AppRole, AppSite } from "@/lib/auth/current-user";
import { sanitizeUserForViewer } from "@/lib/users/visibility";

export const dynamic = "force-dynamic";

const VALID_ROLES: AppRole[] = [
  "writer",
  "editor",
  "graphics",
  "manager",
  "admin",
  "eic",
  "operations",
];

const VALID_SITES: AppSite[] = ["pl", "qb", "both"];

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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters: ListUsersFilters = {};

  const search = url.searchParams.get("search");
  if (search) filters.search = search;

  const role = url.searchParams.get("role");
  if (role && VALID_ROLES.includes(role as AppRole)) {
    filters.role = role as AppRole;
  }

  const site = url.searchParams.get("site");
  if (site && VALID_SITES.includes(site as AppSite)) {
    filters.site = site as AppSite;
  }

  const teamId = url.searchParams.get("teamId");
  if (teamId) filters.teamId = teamId;

  const limit = Number(url.searchParams.get("limit") ?? "50");
  filters.limit = Math.min(Math.max(Number.isFinite(limit) ? limit : 50, 1), 200);

  const offset = Number(url.searchParams.get("offset") ?? "0");
  filters.offset = Math.max(Number.isFinite(offset) ? offset : 0, 0);

  const result = await listUsers(filters);
  return NextResponse.json({
    ...result,
    users: result.users.map((target) => sanitizeUserForViewer(target, user)),
  });
}
