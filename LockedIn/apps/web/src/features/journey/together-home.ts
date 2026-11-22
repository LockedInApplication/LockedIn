import type { SimplePlan } from "@/features/roadmap/roadmap.types";

export function shouldCelebrateLockIn(lockedAt: string, seenLock: string | null, now: number) {
  const age = now - Date.parse(lockedAt);
  return seenLock !== lockedAt && age >= -60_000 && age < 24 * 60 * 60 * 1000;
}

export function getUpcomingTogetherPlan(plans: SimplePlan[], today = localDay()) {
  return plans.filter(plan => plan.status === "ACCEPTED" && (!plan.day || plan.day >= today))
    .sort((a, b) => (a.day ?? "9999").localeCompare(b.day ?? "9999"))[0];
}

function localDay() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
