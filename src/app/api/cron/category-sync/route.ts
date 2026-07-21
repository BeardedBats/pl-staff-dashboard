import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { authorizeCronRequest } from "@/lib/cron/authorization";
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
async function handle(request: Request) {
  const authorized = await authorizeCronRequest(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  const reports = await syncWpCategoriesForBothSites();
  return NextResponse.json({ ok: true, reports });
}

export { handle as GET, handle as POST };
