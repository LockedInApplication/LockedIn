import type { JourneyOverview } from "./journey.types";

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function daysUntil(value: string | null, now: Date = new Date()): number {
  if (!value) return 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86_400_000));
}

export function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function getProgress(overview: JourneyOverview): number {
  const session = overview.session;
  if (!overview.relationship) return 0;
  if (!session) return 1;
  if (!session.ownResponse || !session.partnerState.submitted) return 2;
  if (!session.bothRevealed) return 3;
  if (!session.nextSteps.length) return 4;
  return 5;
}
