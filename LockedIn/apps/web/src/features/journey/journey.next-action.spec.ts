import { describe, expect, it } from "vitest";
import { getNextAction } from "./journey.next-action";
import type { JourneyOverview, JourneySession } from "./journey.types";
import type { AtlasChapter, AtlasWord } from "@/features/atlas/atlas.types";
import type { JourneyNextStep } from "@/features/roadmap/roadmap.types";

const session: JourneySession = {
  id: "check-in", topic: "Our next chapter", packKey: "intentions", createdAt: "2026-11-14T10:00:00Z",
  status: "COLLECTING", questions: [], ownResponse: null,
  partnerState: { name: "Partner", submitted: false, revealConsented: false },
  bothRevealed: false, alignment: [], proposals: [], proposalHistory: [], nextSteps: [], nextStep: null,
};
const ownResponse = {
  answers: { personal: "PRIVATE ANSWER MUST NEVER APPEAR" }, shareKeys: [], contextNotes: {}, contextShareKeys: [], revealConsented: false,
};
const step: JourneyNextStep = {
  id: "step", title: "Have coffee", details: null, targetDate: "2026-12-01T12:00:00Z",
  reflectionAvailable: false, reflectionOpensAt: "2026-12-01T00:00:00Z", status: "ACCEPTED",
  proposedByCurrentUser: true, proposedByName: "You", ownReflection: null,
  partnerReflection: { submitted: false, outcome: null },
};
const word: AtlasWord = {
  key: "support", title: "Support", icon: "✦", color: "coral", description: "Care", mysteryPrompt: "A moment", versionCount: 0,
  chapter: {
    id: "meaning", status: "COLLECTING", createdAt: "2026-11-14T10:00:00Z", sharedDefinition: null,
    candidateVersion: 0, ownFinalApproval: false, partnerFinalApproval: false, proposedByCurrentUser: false,
    proposedByName: null, proposals: [], ownSelection: null, partnerSelection: null, ownResponse: null,
    partnerResponse: { submitted: false, name: "Partner" },
  },
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

describe("the next action for this person", () => {
  it("leaves unconnected people in the existing invitation flow", () => {
    expect(getNextAction({ ...overview(), relationship: null })).toBeNull();
  });

  it("directs a new pair to choose a conversation", () => {
    expect(getNextAction(overview(null))).toMatchObject({ title: "Choose a conversation", target: "conversations", waiting: false });
  });

  it("offers answering when only the partner has submitted", () => {
    expect(getNextAction(overview({ ...session, partnerState: { ...session.partnerState, submitted: true } }))).toMatchObject({ title: "Answer your questions", target: "current", waiting: false });
  });

  it("reassures the finished person while the partner has not submitted", () => {
    const action = getNextAction(overview({ ...session, ownResponse }));
    expect(action).toMatchObject({ title: "Your part is done", target: "current", waiting: true });
    expect(action?.description).toContain("Your answers are still private");
    expect(JSON.stringify(action)).not.toContain("PRIVATE ANSWER");
  });

  it("offers choosing what to share when both submitted but this person has not consented", () => {
    expect(getNextAction(overview({ ...session, ownResponse, partnerState: { ...session.partnerState, submitted: true, revealConsented: true } }))).toMatchObject({ title: "Review what you’ll share", target: "current", waiting: false });
  });

  it("waits for partner consent even though this person already consented", () => {
    const action = getNextAction(overview({ ...session, ownResponse: { ...ownResponse, revealConsented: true }, partnerState: { ...session.partnerState, submitted: true } }));
    expect(action).toMatchObject({ title: "Your part is done", target: "current", waiting: true });
    expect(action?.description).toContain("Your answers are still private");
    expect(action?.buttonLabel).not.toBe("Continue");
  });

  it("prioritizes a partner's proposal over writing another next step", () => {
    const proposals = [{ id: "proposal", title: "Take a walk", details: null, targetDate: null, proposedByCurrentUser: false, proposedByName: "Partner" }];
    expect(getNextAction(overview(revealed({ proposals })))).toMatchObject({ title: "Review your partner’s suggestion", target: "roadmap", waiting: false });
  });

  it("offers reflection only on a step the server says is available", () => {
    expect(getNextAction(overview(revealed({ nextSteps: [step, { ...step, id: "due", reflectionAvailable: true }] })))).toMatchObject({ title: "Reflect on your next step", target: "roadmap", waiting: false });
  });

  it("does not offer reflection before its revisit date", () => {
    const action = getNextAction(overview(revealed({ nextSteps: [step] })));
    expect(action).toMatchObject({ title: "Your next steps are planned", target: "roadmap" });
    expect(action?.buttonLabel).not.toContain("Reflect");
  });

  it("does not prompt this person to reflect twice", () => {
    const action = getNextAction(overview(revealed({ nextSteps: [{ ...step, reflectionAvailable: true, ownReflection: { outcome: "FOLLOWED_THROUGH", note: "PRIVATE NOTE" } }] })));
    expect(action).toMatchObject({ title: "Your part is done", target: "roadmap", waiting: true });
    expect(action?.description).toContain("Your reflection stays private");
    expect(JSON.stringify(action)).not.toContain("PRIVATE NOTE");
  });

  it("offers reviewing a topic suggestion before starting a different activity", () => {
    const value = { ...overview(null), conversationSelection: { ownChoice: { submitted: false, packKey: null }, partnerChoice: { submitted: true, packKey: "intentions", name: "Partner" } } };
    expect(getNextAction(value)).toMatchObject({ title: "Review your partner’s suggestion", target: "conversations", waiting: false });
  });

  it("explains different topic choices rather than claiming a check-in has begun", () => {
    const value = { ...overview(null), conversationSelection: { ownChoice: { submitted: true, packKey: "intentions" }, partnerChoice: { submitted: true, packKey: "communication", name: "Partner" } } };
    expect(getNextAction(value)).toMatchObject({ title: "Choose a conversation together", target: "conversations", waiting: false });
  });

  it("lets a person view their saved topic suggestion while waiting", () => {
    const value = { ...overview(null), conversationSelection: { ownChoice: { submitted: true, packKey: "intentions" }, partnerChoice: { submitted: false, packKey: null, name: "Partner" } } };
    expect(getNextAction(value)).toMatchObject({ title: "Your suggestion is saved", target: "conversations", waiting: true });
  });

  it("offers continuing the unfinished Support activity after a completed conversation", () => {
    expect(getNextAction({ ...overview(revealed()), atlas: { words: [word] } })).toMatchObject({ title: "Answer your Support questions", target: "atlas", waiting: false });
  });

  it("describes Atlas waiting without inventing a separate consent step", () => {
    const response = { id: "response", definition: "PRIVATE MEANING", example: "PRIVATE EXAMPLE", notMeaning: "PRIVATE BOUNDARY", heardSummary: null, heardStatus: null };
    const value = { ...overview(null), atlas: { words: [{ ...word, chapter: { ...word.chapter!, ownResponse: response } }] } };
    const action = getNextAction(value);
    expect(action).toMatchObject({ title: "Your part is done", target: "atlas", waiting: true });
    expect(action?.description).toContain("both submit");
    expect(JSON.stringify(action)).not.toContain("PRIVATE MEANING");
  });

  it("does not call Atlas meanings private after both people submit", () => {
    const response = { id: "response", definition: "Meaning", example: "A moment", notMeaning: "Taking over", heardSummary: null, heardStatus: null };
    const value: JourneyOverview = { ...overview(null), atlas: { words: [{ ...word, chapter: { ...word.chapter!, status: "DISCOVERING", ownResponse: response, partnerResponse: { submitted: true, name: "Partner" } } }] } };
    const action = getNextAction(value);
    expect(action).toMatchObject({ title: "Continue Support together", target: "atlas", waiting: false });
    expect(action?.description).not.toContain("still private");
  });

  it("offers a next step after reveal without claiming the answers are still private", () => {
    const action = getNextAction(overview(revealed()));
    expect(action).toMatchObject({ title: "Choose your next step", target: "roadmap", waiting: false });
    expect(action?.description).not.toContain("still private");
  });

  it("offers a new conversation after both reflected on every step", () => {
    const completed = { ...step, ownReflection: { outcome: "FOLLOWED_THROUGH", note: null }, partnerReflection: { submitted: true, outcome: "FOLLOWED_THROUGH" } };
    expect(getNextAction(overview(revealed({ nextSteps: [completed] })))).toMatchObject({ target: "conversations", waiting: false });
  });

  const meaning = { id: "response", definition: "Meaning", example: "A moment", notMeaning: "Taking over", heardSummary: "I heard you say this", heardStatus: "CONFIRMED" as const };
  function atlasOverview(change: Partial<AtlasChapter>): JourneyOverview {
    return { ...overview(null), atlas: { words: [{ ...word, chapter: { ...word.chapter!, ownResponse: meaning, partnerResponse: { ...meaning, submitted: true, name: "Partner" }, ...change } }] } };
  }

  it.each([
    { status: "PROPOSING" as const, proposals: [{ id: "proposal", definition: "Our meaning", proposedByCurrentUser: true, proposedByName: "You" }] },
    { status: "CHOOSING" as const, ownSelection: { mode: "PROPOSAL" as const, proposalId: "proposal" }, partnerSelection: null },
    { status: "PROPOSED" as const, ownFinalApproval: true, partnerFinalApproval: false },
  ])("recognizes an Atlas waiting state after this person's $status contribution", (change) => {
    expect(getNextAction(atlasOverview(change))).toMatchObject({ target: "atlas", waiting: true });
  });

  it("waits when the person's Atlas summary is submitted and only the partner's check remains", () => {
    expect(getNextAction(atlasOverview({ status: "CHECKING", ownResponse: { ...meaning, heardStatus: "PENDING" } }))).toMatchObject({ target: "atlas", waiting: true });
  });

  it("offers checking the partner's summary even while one's own summary is pending", () => {
    expect(getNextAction(atlasOverview({ status: "CHECKING", ownResponse: { ...meaning, heardStatus: "PENDING" }, partnerResponse: { ...meaning, submitted: true, name: "Partner", heardStatus: "PENDING" } }))).toMatchObject({ title: "Check what your partner heard", target: "atlas", waiting: false });
  });
});
