import { buildRoadmapView } from "../roadmap/roadmap.view.js";
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
  const roadmap = await buildRoadmapView(session.relationshipId, userId);

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
    ...roadmap,
  };
}
