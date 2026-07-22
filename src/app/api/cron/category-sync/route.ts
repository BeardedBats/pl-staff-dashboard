import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { authorizeCronRequest } from "@/lib/cron/authorization";
import { executeCronJob } from "@/lib/cron/execution";
import { syncWpCategoriesForBothSites } from "@/lib/wp-sync/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET (Vercel) / POST (manual) /api/cron/category-sync
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
  return executeCronJob(authorized.source, {
    name: "category-sync",
    intervalSeconds: 7 * 24 * 60 * 60,
  }, async () => {
    const reports = await syncWpCategoriesForBothSites();
    if (reports.some((report) => report.errors.length > 0)) {
      return errorResponse(502, "WordPress category sync incomplete");
    }
    return NextResponse.json({ ok: true, reports });
  });
}

export { handle as GET, handle as POST };
