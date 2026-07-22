export type NotificationDeliverySettings = {
  mode: "immediate" | "daily_digest";
  digest_time: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function localParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function localDateTimeToUtc(parts: LocalParts, timezone: string): Date {
  const desired = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  let candidate = new Date(desired);
  for (let attempt = 0; attempt < 3; attempt++) {
    const represented = localParts(candidate, timezone);
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
    );
    candidate = new Date(candidate.getTime() + desired - representedUtc);
  }
  return candidate;
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function addLocalDays(parts: LocalParts, days: number): LocalParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    ...parts,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function quietHoursEnd(
  local: LocalParts,
  start: string | null,
  end: string | null,
): LocalParts | null {
  if (!start || !end) return null;
  const nowMinutes = local.hour * 60 + local.minute;
  const startMinutes = minutes(start);
  const endMinutes = minutes(end);
  const overnight = startMinutes > endMinutes;
  const inside = overnight
    ? nowMinutes >= startMinutes || nowMinutes < endMinutes
    : nowMinutes >= startMinutes && nowMinutes < endMinutes;
  if (!inside) return null;
  const [hour, minute] = end.split(":").map(Number);
  const nextDay = overnight && nowMinutes >= startMinutes ? 1 : 0;
  return { ...addLocalDays(local, nextDay), hour, minute };
}

export function notificationAvailableAt(
  now: Date,
  settings: NotificationDeliverySettings,
): Date {
  const localNow = localParts(now, settings.timezone);
  let candidateLocal = localNow;

  if (settings.mode === "daily_digest") {
    const [hour, minute] = settings.digest_time.split(":").map(Number);
    const targetMinutes = hour * 60 + minute;
    const nowMinutes = localNow.hour * 60 + localNow.minute;
    candidateLocal = {
      ...addLocalDays(localNow, nowMinutes < targetMinutes ? 0 : 1),
      hour,
      minute,
    };
  }

  const quietEnd = quietHoursEnd(
    candidateLocal,
    settings.quiet_hours_start,
    settings.quiet_hours_end,
  );
  if (quietEnd) candidateLocal = quietEnd;

  if (settings.mode === "immediate" && !quietEnd) return now;
  return localDateTimeToUtc(candidateLocal, settings.timezone);
}
