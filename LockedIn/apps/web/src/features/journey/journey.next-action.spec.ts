import { describe, expect, it } from "vitest";
import { getNextAction } from "./journey.next-action";
import type { JourneyOverview, JourneySession } from "./journey.types";

const session: JourneySession = {
  id: "check-in", topic: "Our next chapter", packKey: "intentions", createdAt: "2026-11-14T10:00:00Z",
  status: "COLLECTING", questions: [], ownResponse: null,
  partnerState: { name: "Partner", submitted: false, revealConsented: false },
  bothRevealed: false, alignment: [], proposals: [], proposalHistory: [], nextSteps: [], nextStep: null,
};
const ownResponse = {
  answers: { personal: "PRIVATE ANSWER MUST NEVER APPEAR" }, shareKeys: [], contextNotes: {}, contextShareKeys: [], revealConsented: false,
};
function overview(current: JourneySession | null = session): JourneyOverview {
  return {
    user: { id: "user", email: "user@example.test", name: "You" }, pendingInvites: [],
    relationship: { id: "relationship", partner: { name: "Partner", email: "partner@example.test" } },
    session: current, checkInHistory: [], conversationPacks: [], conversationSelection: null, atlas: { words: [] },
  };
}
function revealed(change: Partial<JourneySession> = {}): JourneySession {
  return { ...session, ownResponse: { ...ownResponse, revealConsented: true }, partnerState: { name: "Partner", submitted: true, revealConsented: true }, bothRevealed: true, ...change };
}

describe("the Together conversation action", () => {
  it("leaves unconnected people in the invitation flow", () => {
    expect(getNextAction({ ...overview(), relationship: null })).toBeNull();
  });

  it("takes a new pair to the topic picker", () => {
    expect(getNextAction(overview(null))).toMatchObject({
      buttonLabel: "Pick a conversation topic", target: "conversations", waiting: false,
    });
  });

  it("offers answering when only the partner has submitted", () => {
    expect(getNextAction(overview({ ...session, partnerState: { ...session.partnerState, submitted: true } }))).toMatchObject({
      title: "Continue your conversation", buttonLabel: "Answer my questions", target: "current", waiting: false,
    });
  });

  it("keeps submitted answers private while waiting for the partner to answer", () => {
    const action = getNextAction(overview({ ...session, ownResponse }));
    expect(action).toMatchObject({ title: "Waiting for your partner", target: "current", waiting: true });
    expect(action?.description).toContain("Your answers are still private");
    expect(JSON.stringify(action)).not.toContain("PRIVATE ANSWER");
  });

  it("offers reviewing sharing choices after both private answers are submitted", () => {
    const value = overview({ ...session, ownResponse, partnerState: { ...session.partnerState, submitted: true, revealConsented: true } });
    expect(getNextAction(value)).toMatchObject({ title: "Review what you’ll share", target: "current", waiting: false });
  });

  it("continues waiting until the partner also agrees to reveal", () => {
    const action = getNextAction(overview({ ...session, ownResponse: { ...ownResponse, revealConsented: true }, partnerState: { ...session.partnerState, submitted: true } }));
    expect(action).toMatchObject({ title: "Waiting for your partner", buttonLabel: "View my progress", target: "current", waiting: true });
    expect(action?.description).toContain("still private");
  });

  it.each([
    [false, true, "Review their choice", false],
    [true, true, "Review our choices", false],
    [true, false, "View my choice", true],
  ] as const)("handles topic choices from self=%s and partner=%s", (own, partner, buttonLabel, waiting) => {
    const value = { ...overview(null), conversationSelection: {
      ownChoice: { submitted: own, packKey: own ? "intentions" : null },
      partnerChoice: { submitted: partner, packKey: partner ? "support" : null, name: "Partner" },
    } };
    expect(getNextAction(value)).toMatchObject({ buttonLabel, target: "conversations", waiting });
  });

  it("lets a pair pick a new topic after reveal, even when a plan is pending", () => {
    const proposals = [{ id: "proposal", title: "Take a walk", details: null, targetDate: null, proposedByCurrentUser: false, proposedByName: "Partner" }];
    const action = getNextAction(overview(revealed({ proposals })));
    expect(action).toMatchObject({ buttonLabel: "Pick another topic", target: "conversations", waiting: false });
    expect(action?.description).not.toContain("still private");
  });
});
