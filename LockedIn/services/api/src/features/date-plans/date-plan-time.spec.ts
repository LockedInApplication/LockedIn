import { describe, expect, it } from "vitest";
import { validateDatePlanTime } from "./date-plan-time.js";
import { createDatePlanCalendar } from "./date-plan-calendar.js";

describe("date-plan time", () => {
  const now = new Date("2026-11-19T00:00:00Z");
  const ny = { localTime: "2026-11-21T19:00", timeZone: "America/New_York", startsAt: "2026-11-22T00:00:00.000Z" };

  it("validates the selected zone and matching UTC instant", () => {
    expect(validateDatePlanTime(ny, now)).toEqual({ startsAt: new Date(ny.startsAt), timeZone: ny.timeZone });
    for (const time of [
      { ...ny, startsAt: "2026-11-21T19:00:00.000Z" },
      { ...ny, startsAt: "2026-11-22T00:00:00.000000001Z" },
      { ...ny, timeZone: "Mars/New_York" },
      { ...ny, timeZone: "-05:00" },
      { ...ny, localTime: "2026-11-21T19:00:00" },
      { ...ny, localTime: "2027-02-17T19:00", startsAt: "2027-02-18T00:00:00Z" },
    ]) expect(validateDatePlanTime(time, now)).toBeNull();
    expect(validateDatePlanTime(ny, new Date(ny.startsAt))).toBeNull();
    expect(validateDatePlanTime(ny, new Date("2026-11-23T00:00:00Z"))).toBeNull();
  });

  it("rejects both DST gaps and overlaps", () => {
    for (const [localTime, startsAt, clock] of [
      ["2027-03-14T02:30", "2027-03-14T07:30:00Z", "2027-03-13T00:00:00Z"],
      ["2027-11-07T01:30", "2027-11-07T05:30:00Z", "2027-11-06T00:00:00Z"],
      ["2027-11-07T01:30", "2027-11-07T06:30:00Z", "2027-11-06T00:00:00Z"],
    ]) expect(validateDatePlanTime({ localTime, startsAt, timeZone: ny.timeZone }, new Date(clock))).toBeNull();
  });

  it("exports one hour with an escaped venue and stable UID", () => {
    const date = { id: "plan-one", venueName: "A café, wine; bar\\\r\nATTENDEE:private\n" + "日".repeat(50), startsAt: new Date(ny.startsAt), confirmedAt: now };
    const result = createDatePlanCalendar(date);
    const lines = result.contents.split("\r\n");
    const unfolded = result.contents.replace(/\r\n /g, "").split("\r\n");
    expect(result.filename).toMatch(/\.ics$/);
    expect(lines.every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
    expect(unfolded.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(unfolded).toContain("DTSTART:20261122T000000Z");
    expect(unfolded).toContain("DTEND:20261122T010000Z");
    expect(unfolded).toContain("DTSTAMP:20261119T000000Z");
    expect(unfolded).toContain("LOCATION:A café\\, wine\\; bar\\\\\\nATTENDEE:private\\n" + "日".repeat(50));
    expect(unfolded.some((line) => line.startsWith("ATTENDEE"))).toBe(false);
    const uid = lines.find((line) => line.startsWith("UID:"));
    expect(uid).toBeTruthy();
    expect(createDatePlanCalendar({ ...date, venueName: "Other" }).contents.split("\r\n")).toContain(uid);
    expect(createDatePlanCalendar({ ...date, id: "plan-two" }).contents.split("\r\n")).not.toContain(uid);
  });
});
