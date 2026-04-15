import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
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
    return NextResponse.json({ error: authorized.error }, { status: 401 });
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
  if (viewer && isAdminPlus(viewer)) {
    return { ok: true };
  }
  return { ok: false, error: "Not authorized" };
}
