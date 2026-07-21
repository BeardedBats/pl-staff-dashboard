import { describe, expect, it } from "vitest";
import {
  getWordPressSiteConfig,
  normalizeWordPressBaseUrl,
  wordPressBasicAuth,
} from "./config";

describe("WordPress configuration", () => {
  it("returns the configured Pitcher List site", () => {
    expect(getWordPressSiteConfig("pl")).toEqual({
      url: "https://example.com",
      appUsername: "test-user",
      appPassword: "test-application-password",
    });
  });

  it("returns null for an unconfigured optional QB site", () => {
    expect(getWordPressSiteConfig("qb")).toBeNull();
  });

  it("removes every trailing slash from a base URL", () => {
    expect(normalizeWordPressBaseUrl("https://example.com///")).toBe(
      "https://example.com",
    );
  });

  it("removes application-password whitespace before encoding", () => {
    const header = wordPressBasicAuth("test-user", "abcd  efgh\nijkl");
    expect(Buffer.from(header.slice("Basic ".length), "base64").toString()).toBe(
      "test-user:abcdefghijkl",
    );
  });
});
