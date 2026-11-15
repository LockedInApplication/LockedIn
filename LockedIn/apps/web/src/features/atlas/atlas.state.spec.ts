import { describe, expect, it } from "vitest";
import type { AtlasChapter } from "./atlas.types";
import { getAtlasChoiceState } from "./atlas.state";

const ownProposal = {
  id: "proposal-own",
  definition: "Support means showing up with steady care.",
  proposedByCurrentUser: true,
  proposedByName: "Evans",
};

const partnerProposal = {
  id: "proposal-partner",
  definition: "Support means noticing and responding with intention.",
  proposedByCurrentUser: false,
  proposedByName: "Kwame",
};

const baseChapter: AtlasChapter = {
  id: "chapter-1",
  status: "PROPOSING",
  createdAt: "2026-11-14T12:00:00.000Z",
  sharedDefinition: null,
  candidateVersion: 0,
  ownFinalApproval: false,
  partnerFinalApproval: false,
  proposedByCurrentUser: false,
  proposedByName: null,
  proposals: [],
  ownSelection: null,
  partnerSelection: null,
  ownResponse: {
    id: "response-own",
    definition: "Care in action",
    example: "Checking in after a hard day",
    notMeaning: "Trying to fix every problem",
    heardSummary: "Being present without taking over",
    heardStatus: "CONFIRMED",
  },
  partnerResponse: {
    submitted: true,
    name: "Kwame",
    id: "response-partner",
    definition: "Intentional presence",
    example: "Making time to listen",
    notMeaning: "Agreeing with everything",
    heardSummary: "Steady care in ordinary moments",
    heardStatus: "CONFIRMED",
  },
};

describe("getAtlasChoiceState", () => {
  it("keeps the proposal stage waiting until both independent proposals exist", () => {
    expect(
      getAtlasChoiceState({ ...baseChapter, proposals: [ownProposal] }),
    ).toBe("awaiting-proposals");
  });

  it("opens choosing when both proposals are ready", () => {
    expect(
      getAtlasChoiceState({
        ...baseChapter,
        status: "CHOOSING",
        proposals: [ownProposal, partnerProposal],
      }),
    ).toBe("choosing");
  });

  it("recognizes when each person chooses the other person's wording", () => {
    expect(
      getAtlasChoiceState({
        ...baseChapter,
        status: "RESOLVING",
        proposals: [ownProposal, partnerProposal],
        ownSelection: { mode: "PROPOSAL", proposalId: partnerProposal.id },
        partnerSelection: { mode: "PROPOSAL", proposalId: ownProposal.id },
      }),
    ).toBe("crossed");
  });

  it("recognizes when both people keep their own wording", () => {
    expect(
      getAtlasChoiceState({
        ...baseChapter,
        status: "RESOLVING",
        proposals: [ownProposal, partnerProposal],
        ownSelection: { mode: "PROPOSAL", proposalId: ownProposal.id },
        partnerSelection: { mode: "PROPOSAL", proposalId: partnerProposal.id },
      }),
    ).toBe("separate");
  });

  it("keeps blend and keep-both preferences in the mixed resolution path", () => {
    expect(
      getAtlasChoiceState({
        ...baseChapter,
        status: "RESOLVING",
        proposals: [ownProposal, partnerProposal],
        ownSelection: { mode: "BLEND", proposalId: null },
        partnerSelection: { mode: "KEEP_BOTH", proposalId: null },
      }),
    ).toBe("mixed");
  });

  it("recognizes an exact final draft awaiting approval", () => {
    expect(
      getAtlasChoiceState({
        ...baseChapter,
        status: "PROPOSED",
        proposals: [ownProposal, partnerProposal],
        sharedDefinition: "Support means intentional, steady care in action.",
        candidateVersion: 2,
      }),
    ).toBe("final-draft");
  });

  it("recognizes a mutually approved shared definition", () => {
    expect(
      getAtlasChoiceState({
        ...baseChapter,
        status: "SHARED",
        proposals: [ownProposal, partnerProposal],
        sharedDefinition: "Support means intentional, steady care in action.",
        candidateVersion: 2,
        ownFinalApproval: true,
        partnerFinalApproval: true,
      }),
    ).toBe("shared");
  });
});
