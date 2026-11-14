import { describe, expect, it } from "vitest";
import type { AlignmentItem } from "@/features/conversations/conversation.types";
import { alignmentBadge } from "./alignment";

function item(overrides: Partial<AlignmentItem>): AlignmentItem {
  return {
    key: "future",
    label: "How do you currently see this relationship?",
    ownAnswer: "Building toward something long-term",
    partnerAnswer: "Building toward something long-term",
    aligned: true,
    ...overrides,
  };
}

describe("alignmentBadge", () => {
  it.each([
    ["shared-this-time", true, "Shared this time"],
    ["still-shared", true, "Still shared"],
    ["new-shared", true, "New shared ground"],
    ["changed", false, "Something changed"],
    ["worth-discussing", false, "Worth discussing now"],
  ] as const)("labels the %s trend", (trend, aligned, label) => {
    expect(alignmentBadge(item({ trend, aligned }))).toBe(label);
  });

  it("uses the current shared fallback when no trend is present", () => {
    expect(alignmentBadge(item({ trend: undefined, aligned: true }))).toBe("Shared this time");
  });

  it("uses the current discussion fallback when no trend is present", () => {
    expect(alignmentBadge(item({ trend: undefined, aligned: false }))).toBe("Worth discussing now");
  });
});
