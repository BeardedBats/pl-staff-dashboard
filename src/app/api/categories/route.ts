import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listCategories } from "@/lib/entries/queries";
import type { AppSite } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/categories?site=pl|qb|both
 *
 * Returns active categories, optionally filtered by site. Used by the Create
 * Entry modal and filter dropdowns.
 *
 * Note: the full WP category sync lives in Step 10. Until then this endpoint
 * may return an empty list if no categories have been manually seeded.
 */
export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const site = url.searchParams.get("site") as AppSite | null;
  const categories = await listCategories(
    site && ["pl", "qb", "both"].includes(site) ? site : undefined,
  );
  return NextResponse.json({ categories });
}
