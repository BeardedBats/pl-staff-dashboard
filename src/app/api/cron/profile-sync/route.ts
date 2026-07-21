import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { syncWpProfiles } from "@/lib/wp-sync/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/profile-sync
 *
 * Refreshes display_name / bio / avatar_url on every dashboard user from
 * their WP profile. Runs every 6 hours or manually.
 */
export async function POST(request: Request) {
  const authorized = await authorize(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  const report = await syncWpProfiles();
  return NextResponse.json({ ok: true, report });
}

async function authorize(
  request: Request,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${env.CRON_SECRET}`) {
    return { ok: true };
  }
  const viewer = await getCurrentUser();
  if (viewer && isAdminPlusForScope(viewer, "both")) {
    return { ok: true };
  }
  return { ok: false, error: "Not authorized" };
}
