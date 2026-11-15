import { prisma } from "../../lib/prisma.js";
import { getConversationPack } from "../conversations/conversation.catalog.js";
import { buildAlignment } from "./alignment.js";

export async function buildCheckInSnapshot(sessionId: string, userId: string) {
  const session = await prisma.intentionSession.findUnique({
    where: { id: sessionId },
    include: { responses: true },
  });
  if (!session) return null;

  const alignment = buildAlignment(
    session.responses,
    userId,
    getConversationPack(session.packKey).questions,
  );
  const revealedDates = session.responses
    .map((response) => response.revealConsentedAt)
    .filter((value): value is Date => Boolean(value));

  if (revealedDates.length !== 2) return null;

  return {
    id: session.id,
    topic: session.topic,
    createdAt: session.createdAt,
    revealedAt: new Date(Math.max(...revealedDates.map((value) => value.getTime()))),
    alignment,
  };
}

export function reflectionOpensAt(targetDate: Date | null) {
  if (!targetDate) return null;

  const opening = new Date(targetDate);
  opening.setHours(0, 0, 0, 0);
  return opening;
}

export async function buildSessionView(sessionId: string, userId: string) {
  const session = await prisma.intentionSession.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, displayName: true, email: true },
              },
            },
          },
        },
      },
      responses: true,
    },
  });

  if (!session || !session.relationship.members.some((member) => member.userId === userId)) {
    return null;
  }

  const ownResponse = session.responses.find((response) => response.userId === userId);
  const partnerMember = session.relationship.members.find((member) => member.userId !== userId);
  const partnerResponse = session.responses.find(
    (response) => response.userId === partnerMember?.userId,
  );
  const bothRevealed =
    session.responses.length === 2 &&
    session.responses.every((response) => Boolean(response.revealConsentedAt));

  const ownAnswers = (ownResponse?.answers ?? {}) as Record<string, string>;
  const pack = getConversationPack(session.packKey);
  const questions = pack.questions;
  const alignment = buildAlignment(session.responses, userId, questions);
  const relationshipNextSteps = await prisma.sharedNextStep.findMany({
    where: { session: { relationshipId: session.relationshipId } },
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

  function nextStepView(step: (typeof activeNextSteps)[number]) {
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
        reflectionOpening === null || reflectionOpening.getTime() <= Date.now(),
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

  return {
    id: session.id,
    topic: session.topic,
    packKey: session.packKey,
    createdAt: session.createdAt,
    status: session.status,
    questions,
    ownResponse: ownResponse
      ? {
          answers: ownAnswers,
          shareKeys: ownResponse.shareKeys,
          contextNotes: ownResponse.contextNotes as Record<string, string>,
          contextShareKeys: ownResponse.contextShareKeys,
          revealConsented: Boolean(ownResponse.revealConsentedAt),
        }
      : null,
    partnerState: {
      name:
        partnerMember?.user.displayName ??
        partnerMember?.user.name ??
        partnerMember?.user.email ??
        "Your partner",
      submitted: Boolean(partnerResponse),
      revealConsented: Boolean(partnerResponse?.revealConsentedAt),
    },
    bothRevealed,
    alignment,
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
    nextSteps: activeNextSteps.map(nextStepView),
    nextStep: activeNextSteps[0] ? nextStepView(activeNextSteps[0]) : null,
  };
}
