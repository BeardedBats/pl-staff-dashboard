import { z } from "zod";

/**
 * Schedule rule definitions + occurrence computation for recurring templates.
 *
 * The `schedule_rule` column on recurring_templates is a JSONB blob; this
 * module defines its Zod shape and a `computeOccurrencesInRange` function
 * that returns every date between `from` and `to` where the rule fires.
 *
 * Supported rule shapes:
 *   { frequency: "daily",   days: ["mon","tue","wed","thu","fri"] }
 *     → fires on those weekdays every week
 *
 *   { frequency: "weekly",  day: "tue" }
 *     → fires once a week on the named day
 *
 *   { frequency: "monthly", day_of_month: 1 }
 *     → fires once a month on that date (1..28 only, to avoid end-of-month
 *       gotchas)
 *
 *   { frequency: "yearly",  month: 3, day_of_month: 15 }
 *     → fires once a year on that month + day
 */

// --------------------------------------------------------------------------
// Types + schema
// --------------------------------------------------------------------------

export const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayCode = (typeof DAY_CODES)[number];

const dayCodeSchema = z.enum(DAY_CODES);

export const scheduleRuleSchema = z.discriminatedUnion("frequency", [
  z.object({
    frequency: z.literal("daily"),
    days: z.array(dayCodeSchema).min(1),
  }),
  z.object({
    frequency: z.literal("weekly"),
    day: dayCodeSchema,
  }),
  z.object({
    frequency: z.literal("monthly"),
    day_of_month: z.number().int().min(1).max(28),
  }),
  z.object({
    frequency: z.literal("yearly"),
    month: z.number().int().min(1).max(12),
    day_of_month: z.number().int().min(1).max(28),
  }),
]);

export type ScheduleRule = z.infer<typeof scheduleRuleSchema>;

// --------------------------------------------------------------------------
// Occurrence computation
// --------------------------------------------------------------------------

/**
 * Enumerate every date in [from, to] (inclusive) where the rule fires.
 * Returns Date objects at 00:00 in the target timezone, which the caller
 * combines with the template's `default_publish_time` to get a timestamp.
 *
 * The walk is a simple day-by-day loop because our window is bounded
 * (typically 14 days for the generator) and frequencies are straightforward.
 */
export function computeOccurrencesInRange(
  rule: ScheduleRule,
  from: Date,
  to: Date,
): Date[] {
  const out: Date[] = [];
  // Use UTC day math to avoid DST drift.
  const oneDay = 1000 * 60 * 60 * 24;
  const start = startOfDayUtc(from);
  const end = startOfDayUtc(to);

  for (let cursor = start; cursor <= end; cursor += oneDay) {
    const date = new Date(cursor);
    if (matchesRule(rule, date)) {
      out.push(date);
    }
  }
  return out;
}

function matchesRule(rule: ScheduleRule, date: Date): boolean {
  const dow = dayCodeForUtcDate(date);
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth() + 1;

  switch (rule.frequency) {
    case "daily":
      return rule.days.includes(dow);
    case "weekly":
      return dow === rule.day;
    case "monthly":
      return dayOfMonth === rule.day_of_month;
    case "yearly":
      return month === rule.month && dayOfMonth === rule.day_of_month;
  }
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function startOfDayUtc(date: Date): number {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function dayCodeForUtcDate(date: Date): DayCode {
  return DAY_CODES[date.getUTCDay()];
}

/**
 * Compose a JavaScript Date by combining a calendar date (from an occurrence)
 * with a wall-clock time string like "08:30:00" from the template. The
 * result is in UTC; the template assumes the time is already in the target
 * timezone (America/New_York), so we adjust forward by its offset.
 *
 * For the MVP we use a fixed -5h (standard) / -4h (DST) approximation
 * via the target date's string-based offset lookup. Good enough for
 * articles that publish on the hour.
 */
export function combineDateAndTime(
  calendarDate: Date,
  timeString: string | null | undefined,
  timeZone: string = "America/New_York",
): Date {
  if (!timeString) {
    // No explicit time — return midnight on the calendar date.
    return calendarDate;
  }

  const [hh, mm, ss] = timeString.split(":").map((v) => Number(v) || 0);

  // Build an ISO local-time string for the target timezone, then parse it
  // back as a zoned datetime.
  const iso = new Date(calendarDate);
  iso.setUTCHours(hh ?? 0, mm ?? 0, ss ?? 0, 0);

  // Compute the offset of the calendar date in the target timezone vs UTC.
  const offsetMinutes = timezoneOffsetMinutes(calendarDate, timeZone);
  return new Date(iso.getTime() - offsetMinutes * 60 * 1000);
}

/**
 * Returns the offset of `date` in the given IANA timezone relative to UTC,
 * in minutes. Positive for east-of-UTC, negative for west-of-UTC. Handles
 * DST by asking the Intl API for the resolved offset.
 */
function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const zoned = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (zoned - date.getTime()) / (60 * 1000);
}

/**
 * Short human-readable description of a rule — used in admin UIs.
 * Examples: "Every weekday", "Every Tuesday", "1st of each month".
 */
export function describeSchedule(rule: ScheduleRule): string {
  switch (rule.frequency) {
    case "daily": {
      const labels: Record<DayCode, string> = {
        sun: "Sun",
        mon: "Mon",
        tue: "Tue",
        wed: "Wed",
        thu: "Thu",
        fri: "Fri",
        sat: "Sat",
      };
      const sorted = [...rule.days].sort(
        (a, b) => DAY_CODES.indexOf(a) - DAY_CODES.indexOf(b),
      );
      // Collapse to "Weekdays" if the set is Mon-Fri.
      if (
        sorted.length === 5 &&
        sorted.every((d) => ["mon", "tue", "wed", "thu", "fri"].includes(d))
      ) {
        return "Every weekday";
      }
      return `Every ${sorted.map((d) => labels[d]).join(", ")}`;
    }
    case "weekly":
      return `Every ${capitalize(dayNameFromCode(rule.day))}`;
    case "monthly":
      return `${ordinal(rule.day_of_month)} of each month`;
    case "yearly":
      return `${monthName(rule.month)} ${ordinal(rule.day_of_month)} annually`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayNameFromCode(code: DayCode): string {
  const names: Record<DayCode, string> = {
    sun: "Sunday",
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
  };
  return names[code];
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function monthName(month: number): string {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return names[month - 1] ?? "";
}
