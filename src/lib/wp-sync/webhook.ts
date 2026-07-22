import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const wordpressWebhookSchema = z.object({
  site: z.enum(["pl", "qb"]),
  post_id: z.number().int().positive(),
  event_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/),
});

export type WordPressWebhook = z.infer<typeof wordpressWebhookSchema>;

export function verifyWordPressWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || secret.length < 32) return false;
  const supplied = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature;
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(supplied, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
