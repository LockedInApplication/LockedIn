import { prisma } from "../../lib/prisma.js";
import { getActiveRelationship } from "../relationships/relationship-access.service.js";
import { conversationPacks } from "../conversations/conversation.catalog.js";
import { buildCheckInSnapshot, buildSessionView } from "../check-ins/check-in.view.js";
import { addAlignmentTrends } from "../check-ins/alignment.js";
import { atlasWords } from "../atlas/atlas.catalog.js";
import { buildAtlasView } from "../atlas/atlas.view.js";

type OverviewUser = { id: string; email: string; name: string | null };

export async function buildJourneyOverview(userId: string, authenticatedUser?: OverviewUser) {
  const user = authenticatedUser ?? await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true } });
    const [pendingInvites, relationship] = await Promise.all([
      prisma.relationshipInvite.findMany({
        where: {
          status: "PENDING",
          expiresAt: { gt: new Date() },
          OR: [
            { inviteeId: user.id },
            { inviteeEmail: user.email.toLowerCase() },
          ],
        },
        include: {
          inviter: {
            select: { id: true, name: true, displayName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      getActiveRelationship(user.id),
    ]);

    const partner = relationship?.members.find((member) => member.userId !== user.id)?.user;
    let session = null;
    let conversationSelection = null;
    let atlas: Awaited<ReturnType<typeof buildAtlasView>> = {
      words: atlasWords.map((word) => ({ ...word, versionCount: 0, chapter: null })),
    };
    let checkInHistory: Array<NonNullable<Awaited<ReturnType<typeof buildCheckInSnapshot>>>> = [];
    if (relationship) {
      const sessions = await prisma.intentionSession.findMany({
        where: { relationshipId: relationship.id },
        orderBy: { createdAt: "desc" },
      });
      const activeSession = sessions.find((item) => item.status !== "ARCHIVED");
      const archivedSessions = sessions.filter((item) => item.status === "ARCHIVED");

      checkInHistory = (
        await Promise.all(
          archivedSessions.map((item) => buildCheckInSnapshot(item.id, user.id)),
        )
      ).filter(
        (item): item is NonNullable<typeof item> => item !== null,
      );

      if (activeSession) {
        session = await buildSessionView(activeSession.id, user.id);
        if (session) {
          session = {
            ...session,
            alignment: addAlignmentTrends(
              session.alignment,
              checkInHistory[0]?.alignment ?? [],
            ),
          };
        }
      }

      const choices = await prisma.conversationChoice.findMany({
        where: { relationshipId: relationship.id },
        include: {
          user: { select: { id: true, name: true, displayName: true, email: true } },
        },
        orderBy: { updatedAt: "asc" },
      });
      const ownChoice = choices.find((choice) => choice.userId === user.id);
      const partnerChoice = choices.find((choice) => choice.userId !== user.id);
      conversationSelection = {
        ownChoice: ownChoice
          ? { submitted: true, packKey: ownChoice.packKey }
          : { submitted: false, packKey: null },
        partnerChoice: partnerChoice
          ? {
              submitted: true,
              packKey: partnerChoice.packKey,
              name:
                partnerChoice.user.displayName ??
                partnerChoice.user.name ??
                partnerChoice.user.email,
            }
          : {
              submitted: false,
              packKey: null,
              name: partner?.displayName ?? partner?.name ?? partner?.email ?? "Your partner",
            },
      };

      atlas = await buildAtlasView(
        relationship.id,
        user.id,
        partner?.displayName ?? partner?.name ?? partner?.email ?? "Your partner",
      );
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      pendingInvites: pendingInvites.map((invite) => ({
        id: invite.id,
        token: invite.token,
        expiresAt: invite.expiresAt,
        inviter: {
          name:
            invite.inviter.displayName ??
            invite.inviter.name ??
            invite.inviter.email,
          email: invite.inviter.email,
        },
      })),
      relationship: relationship
        ? {
            id: relationship.id,
            partner: {
              name: partner?.displayName ?? partner?.name ?? partner?.email ?? "Your partner",
              email: partner?.email ?? "",
            },
          }
        : null,
      session,
      checkInHistory,
      conversationSelection,
      conversationPacks: conversationPacks.map(({ questions, ...pack }) => ({
        ...pack,
        questionCount: questions.length,
      })),
      atlas,
    };
}

export type JourneyOverviewPayload = Awaited<ReturnType<typeof buildJourneyOverview>>;
