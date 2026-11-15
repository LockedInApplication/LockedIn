import { describe, expect, it } from "vitest";
import {
  buildAtlasWordsView,
  type AtlasChapterRecord,
} from "./atlas.view.js";

const ownUser = {
  id: "user-own",
  name: "Evans",
  displayName: "Evans",
  email: "evans@example.com",
};

const partnerUser = {
  id: "user-partner",
  name: "Kwame",
  displayName: "Kwame",
  email: "kwame@example.com",
};

const ownResponse = {
  id: "response-own",
  userId: ownUser.id,
  definition: "Care in action",
  example: "Checking in after a hard day",
  notMeaning: "Trying to fix every problem",
  heardSummary: null,
  heardStatus: null,
};

const partnerResponse = {
  id: "response-partner",
  userId: partnerUser.id,
  definition: "Intentional presence",
  example: "Making time to listen",
  notMeaning: "Agreeing with everything",
  heardSummary: null,
  heardStatus: null,
};

const ownProposal = {
  id: "proposal-own",
  userId: ownUser.id,
  kind: "PERSONAL",
  definition: "Steady care in action",
  user: ownUser,
};

const partnerProposal = {
  id: "proposal-partner",
  userId: partnerUser.id,
  kind: "PERSONAL",
  definition: "Intentional presence",
  user: partnerUser,
};

const baseChapter: AtlasChapterRecord = {
  id: "chapter-1",
  wordKey: "support",
  status: "COLLECTING",
  createdAt: new Date("2026-11-14T12:00:00.000Z"),
  updatedAt: new Date("2026-11-14T12:00:00.000Z"),
  sharedDefinition: null,
  candidateVersion: 2,
  sharedDefinitionProposedById: null,
  responses: [],
  proposals: [],
  selections: [],
  finalApprovals: [],
  sharedDefinitionProposedBy: null,
};

function supportChapter(chapter: AtlasChapterRecord) {
  return buildAtlasWordsView([chapter], ownUser.id, partnerUser.name).words.find(
    (word) => word.key === "support",
  )!.chapter!;
}

describe("buildAtlasWordsView", () => {
  it("reveals partner meaning details after both private responses exist", () => {
    const chapter = supportChapter({ ...baseChapter, responses: [ownResponse, partnerResponse] });
    expect(chapter.partnerResponse).toEqual({
      submitted: true, name: "Kwame", id: "response-partner", definition: "Intentional presence",
      example: "Making time to listen", notMeaning: "Agreeing with everything", heardSummary: null, heardStatus: null,
    });
  });

  it("reveals both original proposals and the partner selection after both choices exist", () => {
    const chapter = supportChapter({
      ...baseChapter, proposals: [partnerProposal, ownProposal],
      selections: [
        { userId: ownUser.id, mode: "PROPOSAL", proposalId: partnerProposal.id },
        { userId: partnerUser.id, mode: "PROPOSAL", proposalId: ownProposal.id },
      ],
    });
    expect(chapter.proposals).toEqual([
      { id: "proposal-own", definition: "Steady care in action", proposedByCurrentUser: true, proposedByName: "Evans" },
      { id: "proposal-partner", definition: "Intentional presence", proposedByCurrentUser: false, proposedByName: "Kwame" },
    ]);
    expect(chapter.partnerSelection).toEqual({ mode: "PROPOSAL", proposalId: "proposal-own" });
  });

  it("keeps partner response details private until both people submit", () => {
    const chapter = supportChapter({
      ...baseChapter,
      responses: [partnerResponse],
    });

    expect(chapter.partnerResponse).toEqual({ submitted: true, name: "Kwame" });
  });

  it("keeps the partner proposal private until both proposals exist", () => {
    const chapter = supportChapter({
      ...baseChapter,
      status: "PROPOSING",
      proposals: [partnerProposal],
    });

    expect(chapter.proposals).toEqual([]);
  });

  it("keeps the partner selection private until both people select", () => {
    const chapter = supportChapter({
      ...baseChapter,
      status: "CHOOSING",
      proposals: [ownProposal, partnerProposal],
      selections: [
        { userId: partnerUser.id, mode: "PROPOSAL", proposalId: partnerProposal.id },
      ],
    });

    expect(chapter.ownSelection).toBeNull();
    expect(chapter.partnerSelection).toBeNull();
  });

  it("counts approvals only for the current candidate version", () => {
    const chapter = supportChapter({
      ...baseChapter,
      status: "PROPOSED",
      responses: [ownResponse, partnerResponse],
      proposals: [ownProposal, partnerProposal],
      finalApprovals: [
        { userId: ownUser.id, candidateVersion: 1 },
        { userId: partnerUser.id, candidateVersion: 1 },
        { userId: ownUser.id, candidateVersion: 2 },
      ],
    });

    expect(chapter.ownFinalApproval).toBe(true);
    expect(chapter.partnerFinalApproval).toBe(false);
  });
});
