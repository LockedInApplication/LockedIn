import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { reflectionOpensAt } from "./roadmap.dates.js";

export type RoadmapStepRecord = Prisma.SharedNextStepGetPayload<{ include: { proposedBy: { select: { id: true; name: true; displayName: true; email: true } }; reflections: true } }>;

export function nextStepView(step: RoadmapStepRecord, userId: string, now: Date = new Date()) {
    const ownReflection = step.reflections.find((reflection) => reflection.userId === userId);
    const partnerReflection = step.reflections.find((reflection) => reflection.userId !== userId);
    const bothReflected = step.reflections.length === 2;
    const reflectionOpening = reflectionOpensAt(step.targetDate);

    return {
      id: step.id,
      title: step.title,
      details: step.details,
      targetDate: step.targetDate,
      reflectionAvailable:
        reflectionOpening === null || reflectionOpening.getTime() <= now.getTime(),
      reflectionOpensAt: reflectionOpening,
      status: step.status,
      proposedByCurrentUser: step.proposedById === userId,
      proposedByName:
        step.proposedBy.displayName ?? step.proposedBy.name ?? step.proposedBy.email,
      ownReflection: ownReflection
        ? { outcome: ownReflection.outcome, note: ownReflection.note }
        : null,
      partnerReflection: {
        submitted: Boolean(partnerReflection),
        outcome: bothReflected ? partnerReflection?.outcome : null,
      },
    };
  }

export async function buildRoadmapView(relationshipId: string, userId: string) {
  const relationshipNextSteps = await prisma.sharedNextStep.findMany({
    where: { session: { relationshipId: relationshipId } },
    orderBy: { createdAt: "desc" },
    include: {
      proposedBy: {
        select: { id: true, name: true, displayName: true, email: true },
      },
      reflections: true,
    },
  });

  const activeNextSteps = relationshipNextSteps
    .filter(
      (step) =>
        ["ACCEPTED", "COMPLETED", "PAUSED"].includes(step.status) ||
        (step.status === "REVISED" && step.reflections.length > 0),
    )
    .sort((left, right) => {
      const leftDate = left.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDate = right.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    });
  const pendingProposals = relationshipNextSteps.filter((step) => step.status === "PROPOSED");
  const proposalHistory = relationshipNextSteps.filter((step) => step.status === "DECLINED");

  return {
    proposals: pendingProposals.map((step) => ({
      id: step.id,
      title: step.title,
      details: step.details,
      targetDate: step.targetDate,
      proposedByCurrentUser: step.proposedById === userId,
      proposedByName:
        step.proposedBy.displayName ?? step.proposedBy.name ?? step.proposedBy.email,
    })),
    proposalHistory: proposalHistory.map((step) => ({
      id: step.id,
      title: step.title,
      details: step.details,
      targetDate: step.targetDate,
      status: step.status,
      proposedByCurrentUser: step.proposedById === userId,
      proposedByName:
        step.proposedBy.displayName ?? step.proposedBy.name ?? step.proposedBy.email,
    })),
    nextSteps: activeNextSteps.map((step) => nextStepView(step, userId)),
    nextStep: activeNextSteps[0] ? nextStepView(activeNextSteps[0], userId) : null,
  };
}
