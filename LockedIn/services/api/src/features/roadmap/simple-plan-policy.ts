import type { RoadmapPlanStatus } from "../../../generated/prisma/client.js";

export const roadmapReplyKind = "ROADMAP_PLAN_REPLY";

export type PlanAction = "accept" | "counter" | "pass" | "withdraw" | "done" | "cancel";

export function nextSimplePlanState(status: RoadmapPlanStatus, action: PlanAction, own: boolean): RoadmapPlanStatus | null {
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
  return null;
}
