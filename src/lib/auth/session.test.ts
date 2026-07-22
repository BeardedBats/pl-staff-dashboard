import { describe, expect, it } from "vitest";
import {
  createTokenPair,
  hashToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./session";

describe("session token issuance", () => {
  it("issues unique credentials even for the same session in the same second", () => {
    const first = createTokenPair("user-1", "session-1");
    const second = createTokenPair("user-1", "session-1");

    expect(first.accessToken).not.toBe(second.accessToken);
    expect(first.refreshToken).not.toBe(second.refreshToken);
    expect(first.accessTokenHash).not.toBe(second.accessTokenHash);
    expect(first.refreshTokenHash).not.toBe(second.refreshTokenHash);

    const firstAccess = verifyAccessToken(first.accessToken);
    const secondAccess = verifyAccessToken(second.accessToken);
    const firstRefresh = verifyRefreshToken(first.refreshToken);
    const secondRefresh = verifyRefreshToken(second.refreshToken);

    expect(firstAccess?.jti).toBeTruthy();
    expect(firstRefresh?.jti).toBeTruthy();
    expect(firstAccess?.jti).not.toBe(secondAccess?.jti);
    expect(firstRefresh?.jti).not.toBe(secondRefresh?.jti);
  });

  it("does not accept access and refresh credentials in the opposite verifier", () => {
    const pair = createTokenPair("user-1", "session-1");

    expect(verifyAccessToken(pair.refreshToken)).toBeNull();
    expect(verifyRefreshToken(pair.accessToken)).toBeNull();
  });

  it("rejects a modified credential", () => {
    const pair = createTokenPair("user-1", "session-1");
    const modified = `${pair.accessToken.slice(0, -1)}x`;

    expect(verifyAccessToken(modified)).toBeNull();
  });

  it("stores deterministic one-way token hashes instead of credentials", () => {
    const pair = createTokenPair("user-1", "session-1");

    expect(hashToken(pair.accessToken)).toBe(pair.accessTokenHash);
    expect(pair.accessTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pair.accessTokenHash).not.toContain(pair.accessToken);
  });
});
