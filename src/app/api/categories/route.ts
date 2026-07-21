import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parseSearchParams } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listCategories } from "@/lib/entries/queries";

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
    return errorResponse(401, "Not authenticated");
  }

  const parsed = parseSearchParams(
    request,
    z.object({ site: z.enum(["pl", "qb", "both"]).optional() }),
  );
  if (!parsed.ok) return parsed.response;
  const categories = await listCategories(parsed.data.site);
  return NextResponse.json({ categories });
}
