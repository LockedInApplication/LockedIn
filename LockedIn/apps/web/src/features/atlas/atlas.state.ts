import type { AtlasChapter } from "./atlas.types";

export type AtlasChoiceState =
  | "awaiting-proposals"
  | "choosing"
  | "crossed"
  | "separate"
  | "mixed"
  | "final-draft"
  | "shared";

export function getAtlasChoiceState(chapter: AtlasChapter): AtlasChoiceState {
  if (chapter.status === "SHARED") return "shared";
  if (chapter.status === "PROPOSED") return "final-draft";

  const ownProposal = chapter.proposals.find((proposal) => proposal.proposedByCurrentUser);
  const partnerProposal = chapter.proposals.find((proposal) => !proposal.proposedByCurrentUser);
  const bothProposals = Boolean(ownProposal && partnerProposal);

  if (!bothProposals) return "awaiting-proposals";
  if (chapter.status !== "RESOLVING") return "choosing";

  const ownSelectionProposal = chapter.proposals.find(
    (proposal) => proposal.id === chapter.ownSelection?.proposalId,
  );
  const partnerSelectionProposal = chapter.proposals.find(
    (proposal) => proposal.id === chapter.partnerSelection?.proposalId,
  );
  const crossedChoice = Boolean(
    chapter.ownSelection?.mode === "PROPOSAL" &&
      chapter.partnerSelection?.mode === "PROPOSAL" &&
      ownSelectionProposal &&
      partnerSelectionProposal &&
      !ownSelectionProposal.proposedByCurrentUser &&
      partnerSelectionProposal.proposedByCurrentUser,
  );
  const separateChoice = Boolean(
    chapter.ownSelection?.mode === "PROPOSAL" &&
      chapter.partnerSelection?.mode === "PROPOSAL" &&
      ownSelectionProposal?.proposedByCurrentUser &&
      partnerSelectionProposal &&
      !partnerSelectionProposal.proposedByCurrentUser,
  );

  if (crossedChoice) return "crossed";
  if (separateChoice) return "separate";
  return "mixed";
}
