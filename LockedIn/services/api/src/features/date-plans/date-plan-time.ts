import { Temporal } from "@js-temporal/polyfill";

export type DatePlanTimeInput = { localTime: string; timeZone: string; startsAt: string };

const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const NAMED_ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
const WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export function validateDatePlanTime(input: DatePlanTimeInput, now: Date): { startsAt: Date; timeZone: string } | null {
  if (!LOCAL_MINUTE.test(input.localTime) || !NAMED_ZONE.test(input.timeZone) || !UTC_INSTANT.test(input.startsAt)) return null;
  try {
    const instant = Temporal.PlainDateTime.from(input.localTime)
      .toZonedDateTime(input.timeZone, { disambiguation: "reject" }).toInstant();
    if (!instant.equals(Temporal.Instant.from(input.startsAt))) return null;
    const millis = instant.epochMilliseconds;
    if (!(millis > now.getTime() && millis <= now.getTime() + WINDOW_MS)) return null;
    return { startsAt: new Date(millis), timeZone: input.timeZone };
  } catch {
    return null;
  }
}
