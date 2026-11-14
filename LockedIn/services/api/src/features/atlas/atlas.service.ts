import { prisma } from "../../lib/prisma.js";
import { resolveMeaningSelections } from "./atlas.state.js";

export async function savePersonalDefinitionProposal({
  chapterId,
  userId,
  definition,
}: {
  chapterId: string;
  userId: string;
  definition: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "MeaningChapter" WHERE "id" = ${chapterId} FOR UPDATE`;
    const current = await tx.meaningChapter.findUnique({
      where: { id: chapterId },
      include: { proposals: true, selections: true },
    });
    if (!current || current.status === "SHARED" || current.selections.length > 0) {
      return { conflict: true, count: 0 };
    }

    const existing = current.proposals.find(
      (proposal) => proposal.kind === "PERSONAL" && proposal.userId === userId,
    );
    if (existing) {
      await tx.meaningDefinitionProposal.update({
        where: { id: existing.id },
        data: { definition },
      });
    } else {
      await tx.meaningDefinitionProposal.create({
        data: {
          chapterId,
          userId,
          kind: "PERSONAL",
          definition,
        },
      });
    }

    const count = await tx.meaningDefinitionProposal.count({
      where: { chapterId, kind: "PERSONAL" },
    });
    await tx.meaningChapter.update({
      where: { id: chapterId },
      data: { status: count >= 2 ? "CHOOSING" : "PROPOSING" },
    });
    return { conflict: false, count };
  });
}

export async function saveMeaningSelection({
  chapterId,
  userId,
  mode,
  proposalId,
}: {
  chapterId: string;
  userId: string;
  mode: "PROPOSAL" | "BLEND" | "KEEP_BOTH";
  proposalId: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "MeaningChapter" WHERE "id" = ${chapterId} FOR UPDATE`;
    const current = await tx.meaningChapter.findUnique({
      where: { id: chapterId },
      include: { proposals: true, selections: true },
    });
    if (!current || current.status !== "CHOOSING") {
      return { conflict: true, resolved: false };
    }

    await tx.meaningSelection.upsert({
      where: { chapterId_userId: { chapterId, userId } },
      update: { mode, proposalId },
      create: { chapterId, userId, mode, proposalId },
    });

    const selections = await tx.meaningSelection.findMany({ where: { chapterId } });
    if (selections.length < 2) return { conflict: false, resolved: false };

    const resolution = resolveMeaningSelections(selections, current.proposals);
    if (resolution.status === "RESOLVING") {
      await tx.meaningChapter.update({
        where: { id: chapterId },
        data: {
          status: "RESOLVING",
          sharedDefinition: null,
          sharedDefinitionProposedById: null,
        },
      });
      return { conflict: false, resolved: true };
    }

    if (resolution.conflict || !resolution.definition) {
      return { conflict: true, resolved: false };
    }

    if (resolution.proposalKind === "PAIRED") {
      await tx.meaningDefinitionProposal.create({
        data: { chapterId, kind: "PAIRED", definition: resolution.definition },
      });
    }

    await tx.meaningChapter.update({
      where: { id: chapterId },
      data: {
        status: "PROPOSED",
        sharedDefinition: resolution.definition,
        sharedDefinitionProposedById: null,
        candidateVersion: { increment: 1 },
      },
    });
    return { conflict: false, resolved: true };
  });
}

export async function saveResolvedDefinition({
  chapterId,
  userId,
  definition,
  kind,
  expectedVersion,
}: {
  chapterId: string;
  userId: string;
  definition: string;
  kind: "BLEND" | "REVISION" | "PAIRED";
  expectedVersion: number;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "MeaningChapter" WHERE "id" = ${chapterId} FOR UPDATE`;
    const current = await tx.meaningChapter.findUnique({ where: { id: chapterId } });
    if (
      !current ||
      !["RESOLVING", "PROPOSED"].includes(current.status) ||
      current.candidateVersion !== expectedVersion
    ) {
      return { conflict: true };
    }

    await tx.meaningDefinitionProposal.create({
      data: { chapterId, userId, kind, definition },
    });
    await tx.meaningChapter.update({
      where: { id: chapterId },
      data: {
        status: "PROPOSED",
        sharedDefinition: definition,
        sharedDefinitionProposedById: userId,
        candidateVersion: { increment: 1 },
      },
    });
    return { conflict: false };
  });
}

export async function saveFinalApproval({
  chapterId,
  userId,
  candidateVersion,
}: {
  chapterId: string;
  userId: string;
  candidateVersion: number;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "MeaningChapter" WHERE "id" = ${chapterId} FOR UPDATE`;
    const current = await tx.meaningChapter.findUnique({ where: { id: chapterId } });
    if (
      !current ||
      current.status !== "PROPOSED" ||
      !current.sharedDefinition ||
      current.candidateVersion !== candidateVersion
    ) {
      return { conflict: true, complete: false };
    }

    await tx.meaningFinalApproval.upsert({
      where: {
        chapterId_userId_candidateVersion: {
          chapterId,
          userId,
          candidateVersion: current.candidateVersion,
        },
      },
      update: {},
      create: { chapterId, userId, candidateVersion: current.candidateVersion },
    });
    const approvalCount = await tx.meaningFinalApproval.count({
      where: { chapterId, candidateVersion: current.candidateVersion },
    });
    if (approvalCount >= 2) {
      await tx.meaningChapter.update({ where: { id: chapterId }, data: { status: "SHARED" } });
    }
    return { conflict: false, complete: approvalCount >= 2 };
  });
}
