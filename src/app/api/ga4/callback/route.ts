import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { exchangeCodeForTokens } from "@/lib/analytics/ga4";

export const dynamic = "force-dynamic";

/**
 * GET /api/ga4/callback — Google OAuth redirects here with ?code=...
 *
 * We exchange the code, persist the refresh token, and then 302 back to
 * the settings page with a status flag the client can read on mount.
 */
export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer || !isOperations(viewer)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");
  const redirectBase = new URL("/settings?tab=analytics", request.url);
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("ga4_oauth_state")?.value ?? "";
  cookieStore.delete("ga4_oauth_state");

  if (errorParam) {
    redirectBase.searchParams.set("ga4", `error:${errorParam}`);
    return NextResponse.redirect(redirectBase);
  }
  const stateMatches =
    state !== null &&
    expectedState.length === state.length &&
    expectedState.length > 0 &&
    timingSafeEqual(Buffer.from(expectedState), Buffer.from(state));
  if (!stateMatches) {
    redirectBase.searchParams.set("ga4", "error:invalid_state");
    return NextResponse.redirect(redirectBase);
  }
  if (!code) {
    redirectBase.searchParams.set("ga4", "error:no_code");
    return NextResponse.redirect(redirectBase);
  }

  const result = await exchangeCodeForTokens(code);
  if (!result.ok) {
    redirectBase.searchParams.set("ga4", `error:${encodeURIComponent(result.error)}`);
    return NextResponse.redirect(redirectBase);
  }

  redirectBase.searchParams.set("ga4", "connected");
  return NextResponse.redirect(redirectBase);
}
