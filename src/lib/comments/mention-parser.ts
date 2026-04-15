import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * @mention parsing.
 *
 * Format: "@Display Name" — a capitalized first token optionally followed by
 * additional capitalized tokens. The regex is greedy up to 3 tokens so
 * "@Nick Pollack" resolves; "@Ray Graham" resolves; "@Nick the Great"
 * resolves to "Nick" + "the Great" (two mentions).
 *
 * Resolution strategy:
 *   1. Collect candidate names from the text.
 *   2. Match each candidate against `users.display_name` — exact case-
 *      insensitive match first, then prefix match.
 *   3. Return the set of resolved user IDs. Duplicates are dropped so a
 *      mention notification only fires once per comment.
 *
 * Unresolved mentions are silently dropped — the text still renders with
 * the raw "@Name" characters, just without a notification.
 */

/** Match "@" followed by up to 3 capitalized tokens. */
const MENTION_REGEX = /@([A-Z][A-Za-z0-9'.-]*(?:\s[A-Z][A-Za-z0-9'.-]*){0,2})/g;

export type ResolvedMention = {
  user_id: string;
  display_name: string;
  /** The raw text fragment we matched (for highlighting in render). */
  raw: string;
};

/** Extract the candidate @Name strings from a comment body. */
export function extractMentionCandidates(body: string): string[] {
  const out = new Set<string>();
  const matches = body.matchAll(MENTION_REGEX);
  for (const m of matches) {
    // m[1] is the name without the leading @
    out.add(m[1].trim());
  }
  return Array.from(out);
}

/**
 * Resolve candidate names to user IDs via the users table. Runs two passes:
 * exact match first, then prefix match for anything left over.
 */
export async function resolveMentions(
  body: string,
): Promise<ResolvedMention[]> {
  const candidates = extractMentionCandidates(body);
  if (candidates.length === 0) return [];

  const supabase = getSupabaseAdmin();

  // Pull a reasonable slice of users (capped). For larger staff counts we'd
  // switch to a full-text or trigram index; 200 is fine for the current
  // roster.
  const { data: users } = await supabase
    .from("users")
    .select("id, display_name")
    .limit(500);

  if (!users) return [];

  const resolved = new Map<string, ResolvedMention>();

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();

    // Pass 1: exact case-insensitive match.
    let match = (users as Array<{ id: string; display_name: string }>).find(
      (u) => u.display_name.toLowerCase() === lower,
    );

    // Pass 2: starts-with.
    if (!match) {
      match = (users as Array<{ id: string; display_name: string }>).find((u) =>
        u.display_name.toLowerCase().startsWith(lower),
      );
    }

    // Pass 3: first-name only (for "@Nick" matching "Nick Pollack").
    if (!match) {
      match = (users as Array<{ id: string; display_name: string }>).find((u) => {
        const first = u.display_name.split(/\s+/)[0]?.toLowerCase();
        return first === lower;
      });
    }

    if (match && !resolved.has(match.id)) {
      resolved.set(match.id, {
        user_id: match.id,
        display_name: match.display_name,
        raw: `@${candidate}`,
      });
    }
  }

  return Array.from(resolved.values());
}
