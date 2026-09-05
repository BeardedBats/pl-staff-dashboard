import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasRoleForSite } from "@/lib/auth/authorization";
import { syncWpPostsForSite } from "@/lib/wp-sync/posts";
import { errorResponse } from "@/lib/api/http";
export const maxDuration = 60;
export async function POST() {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse(401, "Not authenticated");
  if (!hasRoleForSite(viewer, "pl", "operations")) return errorResponse(403, "Pitcher List Operations access is required");
  try {
    const report = await syncWpPostsForSite("pl", viewer.id);
    return NextResponse.json({ ok: report.errors.length === 0, report,
      ...(report.errors.length ? { error: "Some posts could not synchronize. Retry after checking Connections." } : {}),
    }, { status: report.errors.length ? 502 : 200 });
  } catch { return errorResponse(502, "WordPress recovery failed. Retry safely."); }
}
