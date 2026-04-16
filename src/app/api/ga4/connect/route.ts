import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { buildAuthorizeUrl, isGa4Configured } from "@/lib/analytics/ga4";

export const dynamic = "force-dynamic";

/**
 * POST /api/ga4/connect — returns the Google OAuth URL that the client
 * should open in a new tab. The state param is a random nonce, not tied to
 * our session (we can't read the redirect URL's params otherwise).
 */
export async function POST() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOperations(viewer)) {
    return NextResponse.json(
      { error: "Only Operations can connect GA4" },
      { status: 403 },
    );
  }
  if (!isGa4Configured()) {
    return NextResponse.json(
      {
        error:
          "GA4 is not configured. Set GA4_CLIENT_ID, GA4_CLIENT_SECRET, and GA4_PROPERTY_ID in your environment.",
      },
      { status: 500 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const url = buildAuthorizeUrl(state);
  return NextResponse.json({ url });
}
