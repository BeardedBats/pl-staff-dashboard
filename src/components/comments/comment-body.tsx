import * as React from "react";
import { cn } from "@/lib/utils";

type CommentBodyProps = {
  body: string;
  mentions: Array<{ user_id: string; display_name: string }>;
  className?: string;
};

/**
 * Render a comment body with:
 *   - `**Bold header**` on the first line (used by system comments like
 *     "Polishing request")
 *   - @Display Name mentions highlighted in cyan when they resolve to a
 *     known user from the `mentions` array
 *
 * Not a full markdown parser — we deliberately keep the surface tiny so we
 * don't have to sanitize arbitrary HTML.
 */
export function CommentBody({ body, mentions, className }: CommentBodyProps) {
  const mentionSet = new Set(mentions.map((m) => m.display_name.toLowerCase()));

  // Split on the double-newline that separates a system label from its body.
  const { header, rest } = splitHeader(body);

  return (
    <div className={cn("space-y-1", className)}>
      {header ? (
        <p className="font-sans text-[10px] font-semibold uppercase tracking-wider text-amber">
          {header}
        </p>
      ) : null}
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-cell">
        {renderWithMentions(rest, mentionSet)}
      </p>
    </div>
  );
}

function splitHeader(body: string): { header: string | null; rest: string } {
  const match = body.match(/^\*\*(.+?)\*\*\n\n([\s\S]*)$/);
  if (match) {
    return { header: match[1], rest: match[2] };
  }
  return { header: null, rest: body };
}

const MENTION_REGEX = /@([A-Z][A-Za-z0-9'.-]*(?:\s[A-Z][A-Za-z0-9'.-]*){0,2})/g;

function renderWithMentions(
  text: string,
  knownMentions: Set<string>,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  const matches = Array.from(text.matchAll(MENTION_REGEX));
  for (const m of matches) {
    const matchStart = m.index ?? 0;
    const matchText = m[0];
    const name = m[1];

    if (matchStart > lastIndex) {
      nodes.push(text.slice(lastIndex, matchStart));
    }

    const isKnown =
      knownMentions.has(name.toLowerCase()) ||
      Array.from(knownMentions).some((n) => n.startsWith(name.toLowerCase()));

    if (isKnown) {
      nodes.push(
        <span
          key={`m-${key++}`}
          className="rounded-sm bg-cyan-dim px-1 text-cyan"
        >
          {matchText}
        </span>,
      );
    } else {
      nodes.push(matchText);
    }
    lastIndex = matchStart + matchText.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
