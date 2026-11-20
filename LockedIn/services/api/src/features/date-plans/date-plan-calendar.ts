import { createHash } from "node:crypto";

function timestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n?|\n/g, "\\n")
    .replace(/[;,]/g, "\\$&").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function foldLine(line: string) {
  let length = 0;
  let folded = "";
  for (const character of line) {
    const bytes = Buffer.byteLength(character);
    if (length + bytes > 75) {
      folded += "\r\n ";
      length = 1;
    }
    folded += character;
    length += bytes;
  }
  return folded;
}

export function createDatePlanCalendar(plan: { id: string; venueName: string; startsAt: Date; confirmedAt: Date }) {
  const uid = createHash("sha256").update(plan.id).digest("hex").slice(0, 32);
  const venue = escapeText(plan.venueName);
  return {
    filename: "lockedin-date.ics",
    contents: [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LockedIn//Date Plans//EN",
      "BEGIN:VEVENT", "UID:" + uid + "@lockedin",
      "DTSTAMP:" + timestamp(plan.confirmedAt),
      "DTSTART:" + timestamp(plan.startsAt),
      "DTEND:" + timestamp(new Date(plan.startsAt.getTime() + 60 * 60 * 1000)),
      "SUMMARY:Date at " + venue, "LOCATION:" + venue,
      "END:VEVENT", "END:VCALENDAR", "",
    ].map(foldLine).join("\r\n"),
  };
}
