import { describe, expect, it } from "vitest";
import { getConversationPack } from "../conversations/conversation.catalog.js";
import {
  addAlignmentTrends,
  buildAlignment,
  type AlignmentItem,
  type RevealResponse,
} from "./alignment.js";

const revealedAt = new Date("2026-11-14T12:00:00.000Z");

function response(
  userId: string,
  answer: string,
  overrides: Partial<RevealResponse> = {},
): RevealResponse {
  return {
    userId,
    answers: { future: answer },
    shareKeys: ["future"],
    contextNotes: {},
    contextShareKeys: [],
    revealConsentedAt: revealedAt,
    ...overrides,
  };
}

function alignment(
  key: AlignmentItem["key"],
  ownAnswer: string,
  partnerAnswer: string,
  aligned: boolean,
): AlignmentItem {
  return {
    key,
    label: "How do you currently see this relationship?",
    ownAnswer,
    partnerAnswer,
    aligned,
    ownContext: null,
    partnerContext: null,
  };
}

describe("buildAlignment", () => {
  it("maps option values to labels and reveals only explicitly shared context", () => {
    const questions = getConversationPack("direction").questions;

    expect(
      buildAlignment(
        [
          response("user-own", "long-term", {
            contextNotes: { future: "I am serious about building this carefully." },
            contextShareKeys: ["future"],
          }),
          response("user-partner", "long-term", {
            contextNotes: { future: "This note stays private." },
          }),
        ],
        "user-own",
        questions,
      ),
    ).toEqual([
      {
        key: "future",
        label: "How do you currently see this relationship?",
        ownAnswer: "Building toward something long-term",
        partnerAnswer: "Building toward something long-term",
        aligned: true,
        ownContext: "I am serious about building this carefully.",
        partnerContext: null,
      },
    ]);
  });

  it("returns no comparison until both people consent to reveal", () => {
    const questions = getConversationPack("direction").questions;
    expect(
      buildAlignment(
        [
          response("user-own", "long-term"),
          response("user-partner", "exploring", { revealConsentedAt: null }),
        ],
        "user-own",
        questions,
      ),
    ).toEqual([]);
  });
});

describe("addAlignmentTrends", () => {
  it("classifies new, continuing, changed, and unchanged discussion ground", () => {
    const current = [
      alignment("future", "Same", "Same", true),
      alignment("nextChapter", "Together", "Together", true),
      alignment("timing", "Now", "Now", true),
      alignment("support", "Closer", "Space", false),
      alignment("connection_frequency", "Soon", "Later", false),
    ];
    const previous = [
      alignment("nextChapter", "Together", "Together", true),
      alignment("timing", "Earlier", "Different", false),
      alignment("support", "Soon", "Later", false),
      alignment("connection_frequency", "Soon", "Later", false),
    ];

    expect(addAlignmentTrends(current, previous).map((item) => item.trend)).toEqual([
      "shared-this-time",
      "still-shared",
      "new-shared",
      "changed",
      "worth-discussing",
    ]);
  });

  it("uses worth-discussing for a new difference", () => {
    expect(
      addAlignmentTrends(
        [alignment("connection_next", "Soon", "Later", false)],
        [],
      )[0]?.trend,
    ).toBe("worth-discussing");
  });
});
