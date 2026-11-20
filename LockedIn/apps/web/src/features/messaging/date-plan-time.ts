import type { DatePlanTimeInput } from "./date-plans.types";

const WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export async function datePlanTimeInput(localTime: string, timeZone: string, now = new Date()): Promise<DatePlanTimeInput | null> {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime) || !/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(timeZone)) return null;
  const { Temporal } = await import("@js-temporal/polyfill");
  try {
    const instant = Temporal.PlainDateTime.from(localTime).toZonedDateTime(timeZone, { disambiguation: "reject" }).toInstant();
    const ms = instant.epochMilliseconds;
    return ms > now.getTime() && ms <= now.getTime() + WINDOW_MS
      ? { localTime, timeZone, startsAt: new Date(ms).toISOString() }
      : null;
  } catch { return null; }
}

const parts = (date: Date, zone: string) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
  timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).formatToParts(date).map(({ type, value }) => [type, value]));

export function getDateFields(date: Date, zone: string) {
  const { year, month, day, hour, minute } = parts(date, zone);
  return { date: [year, month, day].join("-"), time: hour + ":" + minute };
}
