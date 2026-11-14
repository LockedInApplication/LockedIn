export type MeaningSelectionInput = {
  mode: "PROPOSAL" | "BLEND" | "KEEP_BOTH";
  proposalId: string | null;
};

export type MeaningProposalInput = {
  id: string;
  kind: string;
  definition: string;
};

export type AtlasResolution = {
  status: "RESOLVING" | "PROPOSED" | "CONFLICT";
  definition: string | null;
  proposalKind: "PAIRED" | null;
  conflict: boolean;
};

export function resolveMeaningSelections(
  selections: MeaningSelectionInput[],
  proposals: MeaningProposalInput[],
): AtlasResolution {
  const [first, second] = selections;
  const sameProposal =
    first.mode === "PROPOSAL" &&
    second.mode === "PROPOSAL" &&
    first.proposalId === second.proposalId;
  const keepBoth = first.mode === "KEEP_BOTH" && second.mode === "KEEP_BOTH";

  if (!sameProposal && !keepBoth) {
    return {
      status: "RESOLVING",
      definition: null,
      proposalKind: null,
      conflict: false,
    };
  }

  if (sameProposal) {
    const selected = proposals.find((proposal) => proposal.id === first.proposalId);
    if (!selected) {
      return {
        status: "CONFLICT",
        definition: null,
        proposalKind: null,
        conflict: true,
      };
    }
    return {
      status: "PROPOSED",
      definition: selected.definition,
      proposalKind: null,
      conflict: false,
    };
  }

  const definition = proposals
    .filter((proposal) => proposal.kind === "PERSONAL")
    .map((proposal) => proposal.definition)
    .join("\n\n—and—\n\n");
  return {
    status: "PROPOSED",
    definition,
    proposalKind: "PAIRED",
    conflict: false,
  };
}
