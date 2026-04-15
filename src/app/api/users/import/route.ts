import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const result = await importWpUser(parsed.data.site, {
    wpUserId: parsed.data.wp_user_id,
    username: parsed.data.username,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const user = await getUserById(result.userId);
  return NextResponse.json({ user, created: result.created });
}
