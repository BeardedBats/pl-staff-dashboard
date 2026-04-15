"use client";

import * as React from "react";
import { AtSign, Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/users/user-avatar";

type StaffSuggestion = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

type CommentComposerProps = {
  entryId: string;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
};

/**
 * Composer with @mention autocomplete.
 *
 * When the user types `@` followed by one or more characters, a small
 * popover appears above the textarea suggesting staff by display name.
 * Clicking / Enter on a suggestion inserts the full display name and
 * closes the popover. The rest of the text continues unmolested.
 */
export function CommentComposer({
  onSubmit,
  onCancel,
  placeholder = "Leave a comment…",
  autoFocus = false,
}: CommentComposerProps) {
  const [body, setBody] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Autocomplete state
  const [suggestions, setSuggestions] = React.useState<StaffSuggestion[]>([]);
  const [suggestionIdx, setSuggestionIdx] = React.useState(0);
  const [mentionStart, setMentionStart] = React.useState<number | null>(null);
  const [mentionFragment, setMentionFragment] = React.useState("");
  const [allStaff, setAllStaff] = React.useState<StaffSuggestion[] | null>(
    null,
  );

  // Lazy-load the staff list the first time the composer is focused.
  async function ensureStaffLoaded() {
    if (allStaff) return;
    try {
      const res = await fetch("/api/users?limit=200");
      const data = (await res.json()) as {
        users: Array<{
          id: string;
          display_name: string;
          avatar_url: string | null;
        }>;
      };
      setAllStaff(
        (data.users ?? []).map((u) => ({
          id: u.id,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
        })),
      );
    } catch {
      setAllStaff([]);
    }
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setBody(value);
    setError(null);

    // Detect if the cursor is inside a `@fragment` mention zone.
    const cursor = e.target.selectionStart ?? value.length;
    const { start, fragment } = detectMention(value, cursor);

    if (start === null) {
      setMentionStart(null);
      setSuggestions([]);
      return;
    }

    setMentionStart(start);
    setMentionFragment(fragment);

    void ensureStaffLoaded().then(() => {
      const list = allStaff ?? [];
      const lower = fragment.toLowerCase();
      const filtered = list
        .filter(
          (u) =>
            lower.length === 0 ||
            u.display_name.toLowerCase().includes(lower),
        )
        .slice(0, 6);
      setSuggestions(filtered);
      setSuggestionIdx(0);
    });
  }

  function insertMention(user: StaffSuggestion) {
    if (mentionStart === null) return;
    const before = body.slice(0, mentionStart);
    const afterStart = mentionStart + 1 + mentionFragment.length; // +1 for the @
    const after = body.slice(afterStart);
    const next = `${before}@${user.display_name} ${after}`;
    setBody(next);
    setMentionStart(null);
    setSuggestions([]);
    // Restore focus + move caret to after the inserted mention.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        const pos = before.length + 1 + user.display_name.length + 1;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestionIdx((i) => Math.min(suggestions.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestionIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertMention(suggestions[suggestionIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionStart(null);
        setSuggestions([]);
        return;
      }
    }

    // Submit on Cmd/Ctrl+Enter.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  }

  async function handleSubmit() {
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await onSubmit(body.trim());
      if (ok) {
        setBody("");
      } else {
        setError("Failed to post comment");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative space-y-2">
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={handleBodyChange}
        onKeyDown={handleKeyDown}
        onFocus={() => void ensureStaffLoaded()}
        placeholder={placeholder}
        rows={3}
        autoFocus={autoFocus}
        disabled={submitting}
      />

      {suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-border bg-popover shadow-lg">
          <ul className="max-h-48 overflow-y-auto p-1">
            {suggestions.map((u, idx) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => insertMention(u)}
                  onMouseEnter={() => setSuggestionIdx(idx)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                    idx === suggestionIdx
                      ? "bg-cyan-dim text-cyan"
                      : "text-text-secondary hover:bg-secondary",
                  )}
                >
                  <UserAvatar
                    displayName={u.display_name}
                    avatarUrl={u.avatar_url}
                    size="xs"
                  />
                  <span>{u.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[11px] text-text-muted">
          <AtSign className="h-3 w-3" />
          Type @ to mention a teammate · ⌘/Ctrl+Enter to post
        </p>
        <div className="flex items-center gap-2">
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
          {onCancel ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={submitting}
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !body.trim()}
          >
            {submitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Mention detection — finds an unterminated @fragment at or before the cursor
// --------------------------------------------------------------------------

function detectMention(
  text: string,
  cursor: number,
): { start: number | null; fragment: string } {
  // Walk backwards from the cursor looking for an '@' that isn't preceded by
  // a non-space character. Abort if we hit whitespace + newline first (a
  // mention can't contain a newline) or if we go past the start of the text.
  let i = cursor - 1;
  let foundAt = -1;

  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      // The '@' must be at the start OR preceded by whitespace / linebreak.
      if (i === 0 || /\s/.test(text[i - 1])) {
        foundAt = i;
      }
      break;
    }
    if (ch === "\n" || ch === "\r") break;
    // Allow any non-newline char as part of the fragment; the regex will
    // enforce shape at resolve time.
    i--;
  }

  if (foundAt < 0) return { start: null, fragment: "" };
  const fragment = text.slice(foundAt + 1, cursor);
  // If the fragment is empty OR is a short prefix of a name, show suggestions.
  return { start: foundAt, fragment };
}
