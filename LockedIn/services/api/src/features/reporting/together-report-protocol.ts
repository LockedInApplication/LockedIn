import { z } from "zod";
import { reportOrigin, signedReportProtocol } from "./signed-weekly-report.js";
export { isReportMonday } from "./signed-weekly-report.js";

export const togetherReportOrigin = reportOrigin;
export const togetherReportPath = "/internal/together-report";
export const togetherReportProtocol = signedReportProtocol(togetherReportPath, "lockedin.together-report.v1");
export const {
  weekFromTarget: reportWeekFromTarget,
  authorization: togetherReportAuthorization,
  sign: signTogetherReport,
  verify: verifyTogetherReport,
} = togetherReportProtocol;
const dateLabel = z.iso.date();
const count = z.int().nonnegative();
const period = { weekStart: dateLabel, weekEndExclusive: dateLabel, timeZone: z.literal("UTC") };

// Fail closed if the database ever returns anything beyond the approved schema.
export const togetherReportResponse = z.discriminatedUnion("status", [
  z.strictObject({ ...period, status: z.literal("insufficient_cohort") }),
  z.strictObject({
    ...period, status: z.literal("ok"), enrolledPairs: count.min(5), pairsWithSharedAction: count,
    plansProposed: count, plansAccepted: count, plansMarkedDone: count,
    savedMemories: count, memoriesWithBothPeople: count,
    repeatMemories: z.discriminatedUnion("status", [
      z.strictObject({ status: z.literal("insufficient_follow_up") }),
      z.strictObject({ status: z.literal("ok"), pairsWithFullFollowUp: count.min(5), pairsWithAnotherSharedMemory: count }),
    ]),
  }),
]);
