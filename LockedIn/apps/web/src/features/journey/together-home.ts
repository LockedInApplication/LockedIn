import type { SimplePlan } from "@/features/roadmap/roadmap.types";
import { conversationTopicHref, currentCheckInHref, workspaceHref } from "./journey.navigation";
import { getNextAction } from "./journey.next-action";
import type { JourneyOverview } from "./journey.types";

const dayMs = 24 * 60 * 60 * 1000;

export function daysTogether(lockedAt: string | undefined, now: number): number | null {
  const age = now - Date.parse(lockedAt ?? "");
  return Number.isFinite(age) && age >= -60_000 ? Math.max(0, Math.floor(age / dayMs)) : null;
}

const relativeTime = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
export function noteAge(updatedAt: string, now: number): string | null {
  const age = now - Date.parse(updatedAt);
  if (!Number.isFinite(age)) return null;
  if (age < 60_000) return "just now";
  if (age < 3_600_000) return relativeTime.format(-Math.floor(age / 60_000), "minute");
  if (age < dayMs) return relativeTime.format(-Math.floor(age / 3_600_000), "hour");
  return relativeTime.format(-Math.floor(age / dayMs), "day");
}

export function shouldCelebrateLockIn(lockedAt: string, seenLock: string | null, now: number) {
  const age = now - Date.parse(lockedAt);
  return seenLock !== lockedAt && age >= -60_000 && age < dayMs;
}

export function getUpcomingTogetherPlan(plans: SimplePlan[], today = localDay()) {
  return plans.filter(plan => plan.status === "ACCEPTED" && (!plan.day || plan.day >= today))
    .sort((a, b) => (a.day ?? "9999").localeCompare(b.day ?? "9999"))[0];
}

export type TogetherNextUp =
  | { kind: "check-in"; href: string; title: string; detail: string }
  | { kind: "plan"; plan: SimplePlan };

export function getTogetherNextUp(overview: JourneyOverview, today?: string): TogetherNextUp | undefined {
  if (!overview.relationship) return undefined;
  const action = getNextAction(overview);
  const { session, conversationSelection: choice } = overview;
  if (action?.target === "current" && !action.waiting && session) {
    return {
      kind: "check-in", href: currentCheckInHref,
      title: session.ownResponse ? action.title : "Answer your private check-in", detail: session.topic,
    };
  }
  if (action?.target === "conversations" && choice?.partnerChoice.submitted && !choice.ownChoice.submitted) {
    return { kind: "check-in", href: conversationTopicHref, title: "Review a check-in topic", detail: action.description };
  }
  const plan = getUpcomingTogetherPlan(overview.simplePlans ?? [], today);
  return plan ? { kind: "plan", plan } : undefined;
}

export const togetherPlanHref = (id: string) => `${workspaceHref("roadmap")}#step-${encodeURIComponent(id)}`;

function localDay() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
