import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/users/me/onboarding — mark the Joyride tour as done.
 *
 * Called when the user either completes or skips the tour. We flip
 * `users.onboarding_completed` so the layout stops showing it.
 */
export async function POST() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { error } = await getSupabaseAdmin()
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", viewer.id);

  if (error) {
    return errorResponse(500, "Failed to mark onboarding complete");
  }

  return NextResponse.json({ ok: true });
}
