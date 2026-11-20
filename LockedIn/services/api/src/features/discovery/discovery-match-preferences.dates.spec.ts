import { describe, expect, it } from "vitest";
import { birthDateCutoff, completedAge, isCalendarBirthDate } from "./discovery-match-preferences.dates.js";

describe("date-only Discovery ages", () => {
  it.each([
    ["2008-02-29", "2026-02-28", 17],
    ["2008-02-29", "2026-03-01", 18],
    ["2008-02-28", "2026-02-28", 18],
    ["2000-11-20", "2026-11-20", 26],
    ["1999-11-21", "2026-11-20", 26],
  ] as const)("ages %s to %d on the UTC calendar (%s)", (birth, today, age) => {
    expect(completedAge(birth, today)).toBe(age);
    expect(birth <= birthDateCutoff(today, age)).toBe(true);
    expect(birth > birthDateCutoff(today, age + 1)).toBe(true);
  });

  it.each([
    ["2026-02-28", 18, "2008-02-28"],
    ["2026-03-01", 18, "2008-03-01"],
    ["2028-02-29", 18, "2010-02-28"],
    ["2028-02-29", 20, "2008-02-29"],
  ] as const)("finds the last birthday with at least the requested years on %s", (today, age, last) => {
    expect(birthDateCutoff(today, age)).toBe(last);
  });

  it.each(["0000-01-01", "2000-02-30", "2001-02-29", "2000-04-31", "2000-13-01", "2000-01-01T00:00:00Z"])("rejects %s rather than normalizing it", value => {
    expect(isCalendarBirthDate(value)).toBe(false);
    expect(isCalendarBirthDate("2000-02-29")).toBe(true);
  });
});
