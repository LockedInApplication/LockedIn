import { describe, expect, it } from "vitest";
import { resolveMeaningSelections } from "./atlas.state.js";

const proposals = [
  {
    id: "proposal-own",
    kind: "PERSONAL" as const,
    definition: "Support means steady care in action.",
  },
  {
    id: "proposal-partner",
    kind: "PERSONAL" as const,
    definition: "Support means noticing and responding intentionally.",
  },
];

describe("resolveMeaningSelections", () => {
  it("uses the preserved definition when both people select the same proposal", () => {
    expect(
      resolveMeaningSelections(
        [
          { mode: "PROPOSAL", proposalId: "proposal-partner" },
          { mode: "PROPOSAL", proposalId: "proposal-partner" },
        ],
        proposals,
      ),
    ).toEqual({
      status: "PROPOSED",
      definition: "Support means noticing and responding intentionally.",
      proposalKind: null,
      conflict: false,
    });
  });

  it("preserves both personal definitions in their existing order", () => {
    expect(
      resolveMeaningSelections(
        [
          { mode: "KEEP_BOTH", proposalId: null },
          { mode: "KEEP_BOTH", proposalId: null },
        ],
        proposals,
      ),
    ).toEqual({
      status: "PROPOSED",
      definition:
        "Support means steady care in action.\n\n—and—\n\nSupport means noticing and responding intentionally.",
      proposalKind: "PAIRED",
      conflict: false,
    });
  });

  it.each([
    [
      { mode: "PROPOSAL" as const, proposalId: "proposal-partner" },
      { mode: "PROPOSAL" as const, proposalId: "proposal-own" },
    ],
    [
      { mode: "PROPOSAL" as const, proposalId: "proposal-own" },
      { mode: "PROPOSAL" as const, proposalId: "proposal-partner" },
    ],
    [
      { mode: "BLEND" as const, proposalId: null },
      { mode: "KEEP_BOTH" as const, proposalId: null },
    ],
  ])("keeps crossed, separate, and mixed choices in resolution", (first, second) => {
    expect(resolveMeaningSelections([first, second], proposals)).toEqual({
      status: "RESOLVING",
      definition: null,
      proposalKind: null,
      conflict: false,
    });
  });

  it("returns the current conflict outcome for an unknown selected proposal", () => {
    expect(
      resolveMeaningSelections(
        [
          { mode: "PROPOSAL", proposalId: "proposal-missing" },
          { mode: "PROPOSAL", proposalId: "proposal-missing" },
        ],
        proposals,
      ),
    ).toEqual({
      status: "CONFLICT",
      definition: null,
      proposalKind: null,
      conflict: true,
    });
  });
});
