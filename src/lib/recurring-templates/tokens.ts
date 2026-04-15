/**
 * Render dynamic title tokens in a recurring template's title_pattern.
 *
 * Supported tokens:
 *   {date}        → "April 16"     (MMMM d in the template's timezone)
 *   {month}       → "April"        (MMMM)
 *   {week}        → "Week 3"       (week-of-season; needs a seasonStart date)
 *   {day_of_week} → "Tuesday"      (long weekday name)
 *
 * Tokens are expanded against a target date — the date on which the
 * generated entry is scheduled to publish. For non-seasonal tokens the
 * `seasonStart` argument is optional; for {week} it's required, and if
 * omitted the token is rendered as-is (no replacement) so bugs are
 * visible instead of silent.
 */

export type RenderTokensOptions = {
  targetDate: Date;
  /** First day of the active season. Required for {week} to resolve. */
  seasonStart?: Date | null;
  /**
   * IANA timezone for formatting. Defaults to UTC because the generator
   * passes UTC-anchored dates (midnight UTC of the intended calendar day).
   * The ET wall-clock offset is applied separately by combineDateAndTime
   * when computing publish_date — keeping title rendering in UTC avoids
   * an off-by-one where "April 15 00:00 UTC" would render as "April 14"
   * in ET (previous day).
   */
  timeZone?: string;
};

export function renderTitle(
  pattern: string,
  opts: RenderTokensOptions,
): string {
  const { targetDate, seasonStart, timeZone = "UTC" } = opts;

  return pattern.replace(/\{(date|month|week|day_of_week)\}/g, (_match, token: string) => {
    switch (token) {
      case "date":
        return formatMonthDay(targetDate, timeZone);
      case "month":
        return formatMonth(targetDate, timeZone);
      case "day_of_week":
        return formatDayOfWeek(targetDate, timeZone);
      case "week":
        return formatSeasonWeek(targetDate, seasonStart);
      default:
        return `{${token}}`;
    }
  });
}

// --------------------------------------------------------------------------
// Formatters
// --------------------------------------------------------------------------

function formatMonthDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone,
  }).format(date);
}

function formatMonth(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone,
  }).format(date);
}

function formatDayOfWeek(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  }).format(date);
}

function formatSeasonWeek(
  target: Date,
  seasonStart: Date | null | undefined,
): string {
  if (!seasonStart) {
    // No reference point — leave the token literal so it's visually
    // obvious something's missing.
    return "{week}";
  }
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor(
    (target.getTime() - seasonStart.getTime()) / msPerDay,
  );
  if (diffDays < 0) return "Preseason";
  const weekNumber = Math.floor(diffDays / 7) + 1;
  return `Week ${weekNumber}`;
}

// --------------------------------------------------------------------------
// Helpers exposed for testing + UI previews
// --------------------------------------------------------------------------

/** Returns the list of tokens found in a pattern. Used for validation UI. */
export function extractTokensInPattern(pattern: string): string[] {
  const matches = pattern.matchAll(/\{(date|month|week|day_of_week)\}/g);
  return Array.from(new Set(Array.from(matches, (m) => m[1])));
}
