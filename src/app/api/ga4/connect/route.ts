import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { buildAuthorizeUrl, isGa4Configured } from "@/lib/analytics/ga4";

export const dynamic = "force-dynamic";

/**
 * POST /api/ga4/connect — returns the Google OAuth URL that the client
 * should open in a new tab. The state nonce is bound to the current browser
 * with a short-lived HttpOnly cookie and validated by the callback.
 */
export async function POST() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  if (!isOperations(viewer)) {
    return errorResponse(403, "Only Operations can connect GA4");
  }
  if (!isGa4Configured()) {
    return errorResponse(
      500,
      "GA4 is not configured. Set the required GA4 environment variables.",
    );
  }

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("ga4_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/ga4/callback",
    maxAge: 10 * 60,
  });
  const url = buildAuthorizeUrl(state);
  return NextResponse.json({ url });
}
