import "server-only";

import crypto from "node:crypto";
import jwt, { type SignOptions, type JwtPayload } from "jsonwebtoken";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

export const ACCESS_TOKEN_COOKIE = "pl_at";
export const REFRESH_TOKEN_COOKIE = "pl_rt";

const ACCESS_EXPIRES_IN: SignOptions["expiresIn"] = "15m";
const REFRESH_EXPIRES_IN: SignOptions["expiresIn"] = "7d";

const ACCESS_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Payload we put inside the JWT. `sid` lets us revoke via sessions table. */
export type SessionTokenPayload = JwtPayload & {
  sub: string;         // users.id (UUID)
  sid: string;         // sessions.id (UUID)
  kind: "access" | "refresh";
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
};

// --------------------------------------------------------------------------
// Signing + verifying
// --------------------------------------------------------------------------

function signWithKind(
  userId: string,
  sessionId: string,
  kind: "access" | "refresh",
): string {
  const secret = kind === "access" ? env.JWT_SECRET : env.JWT_REFRESH_SECRET;
  const expiresIn = kind === "access" ? ACCESS_EXPIRES_IN : REFRESH_EXPIRES_IN;
  return jwt.sign(
    { sub: userId, sid: sessionId, kind },
    secret,
    { expiresIn, issuer: "pl-staff-dashboard" },
  );
}

/**
 * Generate a fresh access + refresh token pair for a user/session,
 * along with the SHA-256 hashes that should be stored in the DB.
 */
export function createTokenPair(userId: string, sessionId: string): TokenPair {
  const accessToken = signWithKind(userId, sessionId, "access");
  const refreshToken = signWithKind(userId, sessionId, "refresh");

  return {
    accessToken,
    refreshToken,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    refreshExpiresAt: new Date(Date.now() + REFRESH_MAX_AGE_SECONDS * 1000),
  };
}

/** Verify an access token. Returns the payload or `null`. */
export function verifyAccessToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: "pl-staff-dashboard",
    }) as SessionTokenPayload;
    if (decoded.kind !== "access") return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Verify a refresh token. Returns the payload or `null`. */
export function verifyRefreshToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: "pl-staff-dashboard",
    }) as SessionTokenPayload;
    if (decoded.kind !== "refresh") return null;
    return decoded;
  } catch {
    return null;
  }
}

/** SHA-256 hex hash of a token for DB storage. Deterministic. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// --------------------------------------------------------------------------
// Cookies
// --------------------------------------------------------------------------

/**
 * Set both auth cookies on the current response.
 * HttpOnly so client JS can't read them. Secure in production.
 */
export async function setAuthCookies(pair: TokenPair): Promise<void> {
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";

  cookieStore.set(ACCESS_TOKEN_COOKIE, pair.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE_SECONDS,
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE, pair.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

/** Clear auth cookies — used by logout and failed refreshes. */
export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

/** Read the access token from cookies. Returns `null` if absent. */
export async function readAccessTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

/** Read the refresh token from cookies. Returns `null` if absent. */
export async function readRefreshTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value ?? null;
}
