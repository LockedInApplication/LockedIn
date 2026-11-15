import { describe, expect, it } from "vitest";
import type { JourneyOverview, JourneySession } from "@/lib/journey";
import { addDays, daysUntil, formatDate, getProgress, initials } from "./journey.utils";

const baseSession: JourneySession = {
  id: "session-1",
  topic: "Our next chapter",
  packKey: "future",
  createdAt: "2026-11-14T12:00:00.000Z",
  status: "ACTIVE",
  questions: [],
  ownResponse: null,
  partnerState: {
    name: "Kwame",
    submitted: false,
    revealConsented: false,
  },
  bothRevealed: false,
  alignment: [],
  proposals: [],
  proposalHistory: [],
  nextSteps: [],
  nextStep: null,
};

const baseOverview: JourneyOverview = {
  user: { id: "user-1", email: "evans@example.com", name: "Evans Asuboah" },
  pendingInvites: [],
  relationship: null,
  session: null,
  checkInHistory: [],
  conversationPacks: [],
  conversationSelection: null,
  atlas: { words: [] },
};

describe("journey utilities", () => {
  it("builds the same two-letter initials used by the workspace", () => {
    expect(initials("Evans Asuboah Stetson")).toBe("EA");
  });

  it("formats dates and preserves a missing date", () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate("2026-11-27T12:00:00.000Z")).toBe("Nov 27, 2026");
  });

  it("counts calendar days from an injected current time and clamps past dates", () => {
    const now = new Date("2026-11-14T09:00:00-05:00");

    expect(daysUntil("2026-11-14T18:00:00-05:00", now)).toBe(0);
    expect(daysUntil("2026-11-17T18:00:00-05:00", now)).toBe(3);
    expect(daysUntil("2026-11-10T18:00:00-05:00", now)).toBe(0);
    expect(daysUntil(null, now)).toBe(0);
  });

  it("adds whole calendar days without changing the current output format", () => {
    expect(addDays("2026-01-15T12:00:00.000Z", 2)).toBe("2026-01-17T12:00:00.000Z");
  });

  it("reports each current roadmap progress stage", () => {
    const withRelationship: JourneyOverview = {
      ...baseOverview,
      relationship: {
        id: "relationship-1",
        partner: { name: "Kwame", email: "kwame@example.com" },
      },
    };
    const awaitingResponses: JourneyOverview = {
      ...withRelationship,
      session: baseSession,
    };
    const responsesReady: JourneyOverview = {
      ...withRelationship,
      session: {
        ...baseSession,
        ownResponse: {
          answers: {},
          shareKeys: [],
          contextNotes: {},
          contextShareKeys: [],
          revealConsented: false,
        },
        partnerState: { ...baseSession.partnerState, submitted: true },
      },
    };
    const revealed: JourneyOverview = {
      ...responsesReady,
      session: { ...responsesReady.session!, bothRevealed: true },
    };
    const withNextStep: JourneyOverview = {
      ...revealed,
      session: {
        ...revealed.session!,
        nextSteps: [
          {
            id: "step-1",
            title: "Meet over coffee",
            details: null,
            targetDate: null,
            reflectionAvailable: false,
            reflectionOpensAt: null,
            status: "ACCEPTED",
            proposedByCurrentUser: true,
            proposedByName: "Evans",
            ownReflection: null,
            partnerReflection: { submitted: false, outcome: null },
          },
        ],
      },
    };

    expect(getProgress(baseOverview)).toBe(0);
    expect(getProgress(withRelationship)).toBe(1);
    expect(getProgress(awaitingResponses)).toBe(2);
    expect(getProgress(responsesReady)).toBe(3);
    expect(getProgress(revealed)).toBe(4);
    expect(getProgress(withNextStep)).toBe(5);
  });
});
