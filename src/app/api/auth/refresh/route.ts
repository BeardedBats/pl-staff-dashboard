import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  createTokenPair,
  hashToken,
  readRefreshTokenFromCookies,
  setAuthCookies,
  verifyRefreshToken,
} from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Rotate access + refresh tokens.
 *
 * Steps:
 *   1. Read the refresh cookie. If missing, 401.
 *   2. Verify the JWT signature. If invalid, 401 and clear cookies.
 *   3. Look up the sessions row by hashed refresh token. If not found, 401.
 *   4. Issue a new token pair, update the session row in-place, set cookies.
 *
 * The in-place update means an attacker who steals a refresh token can only
 * use it once — after rotation, the original hash no longer matches.
 */
export async function POST() {
  const refreshToken = await readRefreshTokenFromCookies();
  if (!refreshToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = verifyRefreshToken(refreshToken);
  if (!payload || !payload.sub || !payload.sid) {
    await clearAuthCookies();
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const refreshHash = hashToken(refreshToken);

  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, user_id, expires_at")
    .eq("id", payload.sid)
    .eq("refresh_token_hash", refreshHash)
    .maybeSingle();

  if (error || !session) {
    await clearAuthCookies();
    return NextResponse.json({ error: "Session not found" }, { status: 401 });
  }

  if (new Date(session.expires_at as string).getTime() < Date.now()) {
    await supabase.from("sessions").delete().eq("id", payload.sid);
    await clearAuthCookies();
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const pair = createTokenPair(payload.sub, payload.sid);

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      token_hash: pair.accessTokenHash,
      refresh_token_hash: pair.refreshTokenHash,
      expires_at: pair.refreshExpiresAt.toISOString(),
    })
    .eq("id", payload.sid);

  if (updateError) {
    return NextResponse.json({ error: "Failed to rotate tokens" }, { status: 500 });
  }

  await setAuthCookies(pair);
  return NextResponse.json({ ok: true });
}
