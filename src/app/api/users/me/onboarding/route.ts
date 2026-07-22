import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/users/me/onboarding — mark role-based setup as complete.
 *
 * Called only after the user completes every item in the setup checklist.
 * The introductory tour is dismissible and does not call this endpoint.
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
