import { Temporal } from "@js-temporal/polyfill";
import type { RoadmapPlan, RoadmapPlanStatus } from "../../../generated/prisma/client.js";
import type { SimplePlanAction } from "./simple-plan.schemas.js";

export const roadmapReplyKind = "ROADMAP_PLAN_REPLY";

export type SimplePlanSchedule = Pick<RoadmapPlan, "day" | "completionOpensAt">;

export function simplePlanSchedule(day: string | null, timeZone: string | undefined, previous?: SimplePlanSchedule): SimplePlanSchedule {
  if (!day) return { day: null, completionOpensAt: null };
  const date = new Date(`${day}T00:00:00Z`);
  if (previous?.day?.getTime() === date.getTime()) return { day: date, completionOpensAt: previous.completionOpensAt };
  const opensAt = timeZone ? Temporal.PlainDate.from(day).toZonedDateTime(timeZone).epochMilliseconds : null;
  return { day: date, completionOpensAt: opensAt === null ? null : new Date(opensAt) };
}

export function simplePlanCompletionOpensAt({ day, completionOpensAt }: SimplePlanSchedule) {
  // Older plans only recorded a calendar day. Wait until that day has started in every time zone.
  return day ? completionOpensAt ?? new Date(day.getTime() + 12 * 60 * 60 * 1000) : null;
}

export function nextSimplePlanState(status: RoadmapPlanStatus, action: SimplePlanAction["action"], own: boolean): RoadmapPlanStatus | null {
  if (status === "PENDING") {
    if (own) return action === "withdraw" ? "WITHDRAWN" : null;
    if (action === "accept") return "ACCEPTED";
    if (action === "pass") return "PASSED";
    if (action === "counter") return "PENDING";
  }
  if (status === "ACCEPTED") {
    if (action === "done") return "DONE";
    if (action === "cancel") return "CANCELED";
  }
  if (status === "DONE" && action === "undo-done") return "ACCEPTED";
  return null;
}
