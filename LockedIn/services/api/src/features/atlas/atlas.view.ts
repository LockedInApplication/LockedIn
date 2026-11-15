import { prisma } from "../../lib/prisma.js";
import { atlasWords } from "./atlas.catalog.js";

type AtlasUserRecord = {
  id: string;
  name: string | null;
  displayName: string | null;
  email: string;
};

type AtlasResponseRecord = {
  id: string;
  userId: string;
  definition: string;
  example: string;
  notMeaning: string;
  heardSummary: string | null;
  heardStatus: string | null;
};

type AtlasProposalRecord = {
  id: string;
  userId: string | null;
  kind: string;
  definition: string;
  user: AtlasUserRecord | null;
};

type AtlasSelectionRecord = {
  userId: string;
  mode: "PROPOSAL" | "BLEND" | "KEEP_BOTH";
  proposalId: string | null;
};

type AtlasApprovalRecord = {
  userId: string;
  candidateVersion: number;
};

export type AtlasChapterRecord = {
  id: string;
  wordKey: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sharedDefinition: string | null;
  candidateVersion: number;
  sharedDefinitionProposedById: string | null;
  responses: AtlasResponseRecord[];
  proposals: AtlasProposalRecord[];
  selections: AtlasSelectionRecord[];
  finalApprovals: AtlasApprovalRecord[];
  sharedDefinitionProposedBy: AtlasUserRecord | null;
};

export function buildAtlasWordsView(
  chapters: AtlasChapterRecord[],
  userId: string,
  partnerName: string,
) {
  return {
    words: atlasWords.map((word) => {
      const wordChapters = chapters.filter((chapter) => chapter.wordKey === word.key);
      const chapter = wordChapters[0];
      if (!chapter) return { ...word, versionCount: 0, chapter: null };

      const ownResponse = chapter.responses.find((response) => response.userId === userId);
      const partnerResponse = chapter.responses.find((response) => response.userId !== userId);
      const bothSubmitted = Boolean(ownResponse && partnerResponse);
      const personalProposals = chapter.proposals.filter((proposal) => proposal.kind === "PERSONAL");
      const ownProposal = personalProposals.find((proposal) => proposal.userId === userId);
      const partnerProposal = personalProposals.find((proposal) => proposal.userId !== userId);
      const bothProposed = Boolean(ownProposal && partnerProposal);
      const ownSelection = chapter.selections.find((selection) => selection.userId === userId);
      const partnerSelection = chapter.selections.find((selection) => selection.userId !== userId);
      const currentApprovals = chapter.finalApprovals.filter(
        (approval) => approval.candidateVersion === chapter.candidateVersion,
      );

      return {
        ...word,
        versionCount: wordChapters.filter((item) => item.status === "SHARED").length,
        previousDefinitions: wordChapters
          .filter((item) => item.status === "SHARED" && item.id !== chapter.id)
          .map((item) => ({
            id: item.id,
            definition: item.sharedDefinition,
            sharedAt: item.updatedAt,
          })),
        chapter: {
          id: chapter.id,
          status: chapter.status,
          createdAt: chapter.createdAt,
          sharedDefinition: chapter.sharedDefinition,
          candidateVersion: chapter.candidateVersion,
          ownFinalApproval: currentApprovals.some((approval) => approval.userId === userId),
          partnerFinalApproval: currentApprovals.some((approval) => approval.userId !== userId),
          proposedByCurrentUser: chapter.sharedDefinitionProposedById === userId,
          proposedByName: chapter.sharedDefinitionProposedBy
            ? chapter.sharedDefinitionProposedBy.displayName ??
              chapter.sharedDefinitionProposedBy.name ??
              chapter.sharedDefinitionProposedBy.email
            : null,
          proposals: [ownProposal, ...(bothProposed ? [partnerProposal] : [])]
            .filter((proposal): proposal is NonNullable<typeof proposal> => Boolean(proposal))
            .map((proposal) => ({
              id: proposal.id,
              definition: proposal.definition,
              proposedByCurrentUser: proposal.userId === userId,
              proposedByName:
                proposal.user?.displayName ??
                proposal.user?.name ??
                proposal.user?.email ??
                partnerName,
            })),
          ownSelection: ownSelection
            ? { mode: ownSelection.mode, proposalId: ownSelection.proposalId }
            : null,
          partnerSelection:
            ownSelection && partnerSelection
              ? { mode: partnerSelection.mode, proposalId: partnerSelection.proposalId }
              : null,
          ownResponse: ownResponse
            ? {
                id: ownResponse.id,
                definition: ownResponse.definition,
                example: ownResponse.example,
                notMeaning: ownResponse.notMeaning,
                heardSummary: ownResponse.heardSummary,
                heardStatus: ownResponse.heardStatus,
              }
            : null,
          partnerResponse: {
            submitted: Boolean(partnerResponse),
            name: partnerName,
            ...(bothSubmitted && partnerResponse
              ? {
                  id: partnerResponse.id,
                  definition: partnerResponse.definition,
                  example: partnerResponse.example,
                  notMeaning: partnerResponse.notMeaning,
                  heardSummary: partnerResponse.heardSummary,
                  heardStatus: partnerResponse.heardStatus,
                }
              : {}),
          },
        },
      };
    }),
  };
}

export async function buildAtlasView(
  relationshipId: string,
  userId: string,
  partnerName: string,
) {
  const chapters = await prisma.meaningChapter.findMany({
    where: { relationshipId },
    include: {
      responses: true,
      proposals: {
        include: {
          user: { select: { id: true, name: true, displayName: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      selections: true,
      finalApprovals: true,
      sharedDefinitionProposedBy: {
        select: { id: true, name: true, displayName: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return buildAtlasWordsView(chapters, userId, partnerName);
}
