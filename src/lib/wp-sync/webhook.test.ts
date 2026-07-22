import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyWordPressWebhookSignature,
  wordpressWebhookSchema,
} from "./webhook";

const secret = "a-test-secret-that-is-at-least-thirty-two-bytes";

describe("WordPress webhook boundary", () => {
  it("accepts an exact HMAC and rejects changed content", () => {
    const body = JSON.stringify({ site: "pl", post_id: 42, event_id: "evt-42" });
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

    expect(verifyWordPressWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyWordPressWebhookSignature(`${body} `, signature, secret)).toBe(false);
  });

  it("rejects malformed signatures without throwing", () => {
    expect(verifyWordPressWebhookSignature("{}", "sha256=nope", secret)).toBe(false);
    expect(verifyWordPressWebhookSignature("{}", null, secret)).toBe(false);
  });

  it("accepts only bounded identifiers and supported sites", () => {
    expect(
      wordpressWebhookSchema.safeParse({
        site: "pl",
        post_id: 42,
        event_id: "post:42.7",
      }).success,
    ).toBe(true);
    expect(
      wordpressWebhookSchema.safeParse({
        site: "other",
        post_id: -1,
        event_id: "unsafe key",
      }).success,
    ).toBe(false);
  });
});
