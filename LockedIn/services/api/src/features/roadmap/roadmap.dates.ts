export function reflectionOpensAt(targetDate: Date | null) {
  if (!targetDate) return null;

  const opening = new Date(targetDate);
  opening.setHours(0, 0, 0, 0);
  return opening;
}
