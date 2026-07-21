import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  readAccessTokenFromCookies,
  readRefreshTokenFromCookies,
  verifyAccessToken,
  verifyRefreshToken,
} from "@/lib/auth/session";
import { sessionRepository } from "@/lib/auth/session-repository";

export const dynamic = "force-dynamic";

export async function POST() {
  const [accessToken, refreshToken] = await Promise.all([
    readAccessTokenFromCookies(),
    readRefreshTokenFromCookies(),
  ]);
  const payloads = [
    accessToken ? verifyAccessToken(accessToken) : null,
    refreshToken ? verifyRefreshToken(refreshToken) : null,
  ].filter((payload) => payload?.sid && payload.sub);

  const sessions = new Map(
    payloads.map((payload) => [payload!.sid, payload!] as const),
  );
  await Promise.allSettled(
    Array.from(sessions.values()).map((payload) =>
      sessionRepository.revoke(payload.sid, payload.sub),
    ),
  );

  await clearAuthCookies();

  return NextResponse.json({ ok: true });
}
