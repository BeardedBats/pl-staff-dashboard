import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names with `clsx` + dedupes Tailwind conflicts with `tailwind-merge`.
 * The canonical shadcn/ui utility — used in every UI primitive.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a Date or ISO string for display in the user's local format.
 * Uses Intl.DateTimeFormat; pass a timezone if you want to override the browser default.
 */
export function formatDate(
  value: string | Date | null | undefined,
  opts: {
    timeZone?: string;
    dateStyle?: "full" | "long" | "medium" | "short";
    timeStyle?: "full" | "long" | "medium" | "short";
  } = {},
): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: opts.dateStyle ?? "medium",
    timeStyle: opts.timeStyle,
    timeZone: opts.timeZone,
  }).format(d);
}

/**
 * Return `true` when we're running on the server (no `window`).
 */
export const isServer = typeof window === "undefined";
