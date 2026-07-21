import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me
 *
 * Returns the current user profile + roles, or 401 if not authenticated.
 * Used by:
 *   - client-side hooks that need the user shape
 *   - onboarding checks (redirect to tour if onboarding_completed = false)
 *   - debugging the auth flow
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "Not authenticated");
  }
  return NextResponse.json({ user });
}
