import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await getSupabaseAdmin()
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", viewer.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to mark onboarding complete" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
