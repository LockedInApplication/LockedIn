import { expect, it } from "vitest";
import { nextSimplePlanState, simplePlanCompletionOpensAt, simplePlanSchedule } from "./simple-plan-policy.js";
import { simplePlanCreate } from "./simple-plan.schemas.js";

it("only allows the recipient to agree, pass, or counter a proposal", () => {
  for (const [action, status] of [["accept", "ACCEPTED"], ["pass", "PASSED"], ["counter", "PENDING"]] as const) {
    expect(nextSimplePlanState("PENDING", action, false)).toBe(status);
    expect(nextSimplePlanState("PENDING", action, true)).toBeNull();
  }
  expect(nextSimplePlanState("PENDING", "withdraw", true)).toBe("WITHDRAWN");
  expect(nextSimplePlanState("PENDING", "withdraw", false)).toBeNull();
});

it("only finishes agreed plans and only undoes the done status", () => {
  expect(nextSimplePlanState("ACCEPTED", "done", false)).toBe("DONE");
  expect(nextSimplePlanState("ACCEPTED", "cancel", true)).toBe("CANCELED");
  expect(nextSimplePlanState("PENDING", "done", true)).toBeNull();
  expect(nextSimplePlanState("DONE", "accept", false)).toBeNull();
  for (const own of [true, false]) expect(nextSimplePlanState("DONE", "undo-done", own)).toBe("ACCEPTED");
  for (const status of ["PENDING", "PASSED", "WITHDRAWN", "ACCEPTED", "CANCELED"] as const) {
    expect(nextSimplePlanState(status, "undo-done", false)).toBeNull();
  }
});

it("uses midnight in the agreed day's time zone, accounting for DST", () => {
  const original = simplePlanSchedule("2026-03-08", "America/New_York");
  expect(original).toEqual({ day: new Date("2026-03-08T00:00Z"), completionOpensAt: new Date("2026-03-08T05:00Z") });
  expect(simplePlanSchedule("2026-03-08", "Asia/Tokyo", original)).toEqual(original);
  const moved = simplePlanSchedule("2026-03-09", "America/New_York", original);
  expect(simplePlanCompletionOpensAt(moved)).toEqual(new Date("2026-03-09T04:00Z"));
  expect(simplePlanCompletionOpensAt(simplePlanSchedule(null, undefined, original))).toBeNull();
  expect(simplePlanCompletionOpensAt(simplePlanSchedule("2026-03-08", undefined))).toEqual(new Date("2026-03-08T12:00Z"));
});

it("accepts a named time zone and rejects malformed zones", () => {
  const input = { requestId: "95889a22-394c-4957-bb85-9b5eac3bac5d", plan: { title: "Try a new spot", day: "2026-11-24" } };
  expect(simplePlanCreate.safeParse(input).success).toBe(true);
  for (const timeZone of ["UTC", "America/Los_Angeles"]) {
    expect(simplePlanCreate.safeParse({ ...input, plan: { ...input.plan, timeZone } }).success).toBe(true);
  }
  for (const timeZone of ["-08:00", "America/Not_a_place"]) {
    expect(simplePlanCreate.safeParse({ ...input, plan: { ...input.plan, timeZone } }).success).toBe(false);
  }
});
