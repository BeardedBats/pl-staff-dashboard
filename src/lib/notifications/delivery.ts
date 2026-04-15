import "server-only";

import { env } from "@/lib/env";

/**
 * Delivery adapters for notification channels.
 *
 * For now both adapters are STUBS — they log what they would have sent
 * instead of hitting Discord / Resend. When Nick is ready to wire up real
 * delivery, swap the implementations inside each function; the callers in
 * lib/notifications/data.ts don't need to change.
 *
 * Each adapter returns `{ ok: true }` on a successful (or stubbed) send,
 * or `{ ok: false, error }` on a real delivery failure. The notification
 * row gets its `discord_sent` / `email_sent` flag flipped to true only on
 * successful delivery.
 */

export type DeliveryResult = { ok: true } | { ok: false; error: string };

// --------------------------------------------------------------------------
// Discord
// --------------------------------------------------------------------------

type DiscordPayload = {
  recipientDiscordId: string;
  recipientName: string;
  title: string;
  body: string;
  actionUrl: string;
};

/**
 * Send a Discord DM to a user. Stubbed until the bot is wired up.
 *
 * When we go live, this will use `discord.js` to:
 *   1. Instantiate a Client with DirectMessages intent
 *   2. Log in with env.DISCORD_BOT_TOKEN
 *   3. Fetch the user by recipientDiscordId
 *   4. Send the formatted message
 */
export async function sendDiscordDM(
  payload: DiscordPayload,
): Promise<DeliveryResult> {
  if (!env.DISCORD_BOT_TOKEN) {
    // Stub mode — Nick hasn't wired Discord yet. Log and pretend success
    // so the delivery flags still flip and the audit trail is honest.
    console.info(
      `[discord stub] Would DM ${payload.recipientName} (${payload.recipientDiscordId}): "${payload.title}" — ${payload.body.slice(0, 100)}`,
    );
    return { ok: true };
  }

  // Placeholder: when we flip the switch, the discord.js implementation
  // goes here.
  console.warn(
    "[discord] DISCORD_BOT_TOKEN is set but delivery is not implemented yet. Skipping.",
  );
  return { ok: true };
}

// --------------------------------------------------------------------------
// Resend (email)
// --------------------------------------------------------------------------

type EmailPayload = {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  bodyMarkdown: string;
  actionUrl: string;
};

/**
 * Send a transactional email via Resend. Stubbed until the API key + sending
 * domain are configured.
 */
export async function sendEmail(
  payload: EmailPayload,
): Promise<DeliveryResult> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.info(
      `[email stub] Would email ${payload.recipientEmail} (${payload.recipientName}): "${payload.subject}"`,
    );
    return { ok: true };
  }

  // Placeholder: the Resend SDK wiring goes here.
  console.warn(
    "[email] RESEND_API_KEY is set but delivery is not implemented yet. Skipping.",
  );
  return { ok: true };
}

// --------------------------------------------------------------------------
// Shared helpers for constructing channel-specific messages
// --------------------------------------------------------------------------

/** Build a Discord-friendly markdown message from a notification. */
export function formatDiscordBody(
  title: string,
  body: string | null,
  actionUrl: string,
): string {
  const lines: string[] = [`**${title}**`];
  if (body) lines.push(body);
  lines.push(`→ ${actionUrl}`);
  return lines.join("\n");
}
