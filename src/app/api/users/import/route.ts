import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForSite } from "@/lib/auth/authorization";
import { importWpUser } from "@/lib/users/mutations";
import { getUserById } from "@/lib/users/queries";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    site: z.enum(["pl", "qb"]),
    wp_user_id: z.number().int().positive().optional(),
    username: z.string().trim().min(1).optional(),
  })
  .refine((v) => typeof v.wp_user_id === "number" || (v.username && v.username.length > 0), {
    message: "Provide wp_user_id or username",
  });

/**
 * POST /api/users/import — Admin+ only. Import a specific WP user into the
 * dashboard without requiring them to log in first. Useful for onboarding
 * new staff or back-filling contributors.
 */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  if (!isAdminPlusForSite(viewer, parsed.data.site)) {
    return errorResponse(403, "Forbidden");
  }

  const result = await importWpUser(parsed.data.site, {
    wpUserId: parsed.data.wp_user_id,
    username: parsed.data.username,
  });

  if (!result.ok) {
    return errorResponse(400, result.error);
  }

  const user = await getUserById(result.userId);
  return NextResponse.json({ user, created: result.created });
}
