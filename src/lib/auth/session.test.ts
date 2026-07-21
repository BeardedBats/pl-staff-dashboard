import { describe, expect, it } from "vitest";
import {
  createTokenPair,
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
});
