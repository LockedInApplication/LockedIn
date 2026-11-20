import { expect, it } from "vitest";
import { nextSimplePlanState } from "./simple-plan-policy.js";

it("only allows the recipient to agree, pass, or counter a proposal", () => {
  for (const [action, status] of [["accept", "ACCEPTED"], ["pass", "PASSED"], ["counter", "PENDING"]] as const) {
    expect(nextSimplePlanState("PENDING", action, false)).toBe(status);
    expect(nextSimplePlanState("PENDING", action, true)).toBeNull();
  }
  expect(nextSimplePlanState("PENDING", "withdraw", true)).toBe("WITHDRAWN");
  expect(nextSimplePlanState("PENDING", "withdraw", false)).toBeNull();
});

it("only finishes mutually agreed plans and never reopens resolved plans", () => {
  expect(nextSimplePlanState("ACCEPTED", "done", false)).toBe("DONE");
  expect(nextSimplePlanState("ACCEPTED", "cancel", true)).toBe("CANCELED");
  expect(nextSimplePlanState("PENDING", "done", true)).toBeNull();
  expect(nextSimplePlanState("DONE", "accept", false)).toBeNull();
});
