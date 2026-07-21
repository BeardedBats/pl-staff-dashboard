import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  createTokenPair,
  hashToken,
  readRefreshTokenFromCookies,
  setAuthCookies,
  verifyRefreshToken,
} from "@/lib/auth/session";
import { rotateRefreshSession } from "@/lib/auth/session-lifecycle";
import { sessionRepository } from "@/lib/auth/session-repository";

export const dynamic = "force-dynamic";

/**
 * Rotate access + refresh tokens.
 *
 * Steps:
 *   1. Read the refresh cookie. If missing, 401.
 *   2. Verify the JWT signature. If invalid, 401 and clear cookies.
 *   3. Compare-and-swap the stored refresh hash to a unique new token pair.
 *   4. Revoke the token family if a concurrent/replayed credential loses.
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

  const refreshHash = hashToken(refreshToken);

  const result = await rotateRefreshSession({
    repository: sessionRepository,
    sessionId: payload.sid,
    userId: payload.sub,
    refreshTokenHash: refreshHash,
    now: new Date(),
    issueNext: () => {
      const pair = createTokenPair(payload.sub, payload.sid);
      return {
        pair,
        accessTokenHash: pair.accessTokenHash,
        refreshTokenHash: pair.refreshTokenHash,
        refreshExpiresAt: pair.refreshExpiresAt,
      };
    },
  });

  if (result.status !== "rotated") {
    await clearAuthCookies();
    return NextResponse.json(
      { error: "Refresh credential is no longer valid" },
      { status: 401 },
    );
  }

  await setAuthCookies(result.pair);
  return NextResponse.json({ ok: true });
}
