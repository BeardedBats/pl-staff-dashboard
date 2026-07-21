import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
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
    return errorResponse(401, "Not authenticated");
  }

  const payload = verifyRefreshToken(refreshToken);
  if (!payload || !payload.sub || !payload.sid) {
    await clearAuthCookies();
    return errorResponse(401, "Invalid refresh token");
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
    return errorResponse(401, "Refresh credential is no longer valid");
  }

  await setAuthCookies(result.pair);
  return NextResponse.json({ ok: true });
}
