import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
import { syncWpCategoriesForBothSites } from "@/lib/wp-sync/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/category-sync
 *
 * Pull WP categories from both sites and reconcile with the dashboard's
 * `categories` table. Rarely changes, so the cron runs weekly; admins
 * can hit this manually after renaming or adding a WP category.
 */
export async function POST(request: Request) {
  const authorized = await authorize(request);
  if (!authorized.ok) {
    return NextResponse.json({ error: authorized.error }, { status: 401 });
  }

  const reports = await syncWpCategoriesForBothSites();
  return NextResponse.json({ ok: true, reports });
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
