import { describe, expect, it } from "vitest";
import { reflectionOpensAt } from "./roadmap.dates.js";
import { nextStepView, type RoadmapStepRecord } from "./roadmap.view.js";

const now = new Date(2026, 10, 14, 9);
const step: RoadmapStepRecord = {
  id: "step-1", sessionId: "session-1", proposedById: "own", title: "Meet over coffee",
  details: null, targetDate: null, status: "ACCEPTED", acceptedAt: now,
  createdAt: now, updatedAt: now,
  proposedBy: { id: "own", name: "Evans", displayName: null, email: "evans@example.com" },
  reflections: [],
};

describe("roadmap reflection dates", () => {
  it("allows reflection without a scheduled date", () => {
    expect(reflectionOpensAt(null)).toBeNull();
    expect(nextStepView(step, "own", now).reflectionAvailable).toBe(true);
  });

  it("opens at local midnight on the chosen day without mutating the target", () => {
    const targetDate = new Date(2026, 10, 14, 12);
    expect(reflectionOpensAt(targetDate)).toEqual(new Date(2026, 10, 14));
    expect(targetDate.getHours()).toBe(12);
    expect(nextStepView({ ...step, targetDate }, "own", now).reflectionAvailable).toBe(true);
  });

  it("keeps future steps locked until their revisit day", () => {
    const targetDate = new Date(2026, 10, 17, 12);
    expect(reflectionOpensAt(targetDate)).toEqual(new Date(2026, 10, 17));
    expect(nextStepView({ ...step, targetDate }, "own", now).reflectionAvailable).toBe(false);
  });

  it("hides a partner outcome and never exposes their private note", () => {
    const partnerReflection = {
      id: "reflection-1", nextStepId: step.id, userId: "partner", outcome: "CHANGED" as const,
      note: "Private note", createdAt: now, updatedAt: now,
    };
    const result = nextStepView({ ...step, reflections: [partnerReflection] }, "own", now);
    expect(result.partnerReflection).toEqual({ submitted: true, outcome: null });
  });
});
