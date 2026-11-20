export const utcDate = (instant: Date) => instant.toISOString().slice(0, 10);
export const calendarDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

export function isCalendarBirthDate(value: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = calendarDate(value);
  return Number.isFinite(date.getTime()) && utcDate(date) === value;
}

export function completedAge(birthDate: string, today: string) {
  return Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - Number(today.slice(5) < birthDate.slice(5));
}

export function birthDateCutoff(today: string, minimumAge: number) {
  const year = String(Number(today.slice(0, 4)) - minimumAge).padStart(4, "0");
  const cutoff = year + today.slice(4);
  return today.endsWith("-02-29") && !isCalendarBirthDate(cutoff) ? `${year}-02-28` : cutoff;
}
