import { registerRoadmapRoutes } from "../features/roadmap/roadmap.routes.js";
import { requireUser, sendError } from "../lib/journey-http.js";
import { sendJourneyEmailSafely } from "../features/journey-notifications/journey-email.service.js";
import { conversationPacks, getConversationPack } from "../features/conversations/conversation.catalog.js";
import { registerConversationRoutes } from "../features/conversations/conversation.routes.js";
import { registerCheckInRoutes } from "../features/check-ins/check-in.routes.js";
import { buildSessionView, buildCheckInSnapshot } from "../features/check-ins/check-in.view.js";
import { addAlignmentTrends } from "../features/check-ins/alignment.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { atlasWords } from "../features/atlas/atlas.catalog.js";
import { registerAtlasRoutes } from "../features/atlas/atlas.routes.js";
import { buildAtlasView } from "../features/atlas/atlas.view.js";
import { isRelationshipMember } from "../features/relationships/relationship-access.service.js";

const inviteSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
});

async function getActiveRelationship(userId: string) {
  return prisma.relationship.findFirst({
    where: {
      status: "ACTIVE",
      members: { some: { userId } },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, displayName: true, email: true },
          },
        },
      },
    },
  });
}

export async function journeyRoutes(server: FastifyInstance) {
  await registerAtlasRoutes(server);
  await registerConversationRoutes(server);
  await registerCheckInRoutes(server);
  await registerRoadmapRoutes(server);

  server.get("/api/journey/overview", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

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
  });

  server.post("/api/journey/invites", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "Enter a valid partner email.");

    if (parsed.data.email === user.email.toLowerCase()) {
      return sendError(reply, 400, "Invite a partner using a different email address.");
    }

    if (await getActiveRelationship(user.id)) {
      return sendError(reply, 409, "You already have an active relationship space.");
    }

    const invitee = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });

    const existingInvite = await prisma.relationshipInvite.findFirst({
      where: {
        inviterId: user.id,
        inviteeEmail: parsed.data.email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      await sendJourneyEmailSafely(request, {
        to: parsed.data.email,
        subject: `${user.name ?? "Someone"} invited you to LockedIn`,
        heading: "A private relationship space is waiting for you.",
        message: `${user.name ?? "Your partner"} invited you to reflect privately and build a shared roadmap together.`,
        actionLabel: "Open private invitation",
        url: `${env.APP_URL}/journey?invite=${existingInvite.token}`,
      });
      return { token: existingInvite.token, expiresAt: existingInvite.expiresAt };
    }

    const invite = await prisma.relationshipInvite.create({
      data: {
        inviterId: user.id,
        inviteeId: invitee?.id ?? null,
        inviteeEmail: parsed.data.email,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await sendJourneyEmailSafely(request, {
      to: parsed.data.email,
      subject: `${user.name ?? "Someone"} invited you to LockedIn`,
      heading: "A private relationship space is waiting for you.",
      message: `${user.name ?? "Your partner"} invited you to reflect privately and build a shared roadmap together.`,
      actionLabel: "Open private invitation",
      url: `${env.APP_URL}/journey?invite=${invite.token}`,
    });

    return reply.code(201).send({ token: invite.token, expiresAt: invite.expiresAt });
  });

  server.post<{ Params: { token: string } }>(
    "/api/journey/invites/:token/accept",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const invite = await prisma.relationshipInvite.findUnique({
        where: { token: request.params.token },
      });

      if (!invite || invite.status !== "PENDING" || !invite.expiresAt || invite.expiresAt <= new Date()) {
        return sendError(reply, 404, "This invitation is no longer available.");
      }

      if (
        invite.inviteeEmail?.toLowerCase() !== user.email.toLowerCase() &&
        invite.inviteeId !== user.id
      ) {
        return sendError(reply, 403, "Sign in with the email address that received this invitation.");
      }

      const [inviterRelationship, inviteeRelationship] = await Promise.all([
        getActiveRelationship(invite.inviterId),
        getActiveRelationship(user.id),
      ]);

      if (inviterRelationship || inviteeRelationship) {
        return sendError(reply, 409, "One of you already has an active relationship space.");
      }

      const relationship = await prisma.$transaction(async (tx) => {
        const created = await tx.relationship.create({
          data: {
            members: {
              create: [{ userId: invite.inviterId }, { userId: user.id }],
            },
          },
        });

        await tx.relationshipInvite.update({
          where: { id: invite.id },
          data: {
            status: "ACCEPTED",
            inviteeId: user.id,
            acceptedAt: new Date(),
          },
        });

        return created;
      });

      const inviter = await prisma.user.findUnique({ where: { id: invite.inviterId } });
      if (inviter?.email) {
        await sendJourneyEmailSafely(request, {
          to: inviter.email,
          name: inviter.name,
          subject: `${user.name ?? "Your partner"} accepted your LockedIn invitation`,
          heading: "Your shared space is ready.",
          message: `${user.name ?? "Your partner"} accepted your invitation. You can now choose a conversation and answer independently.`,
          actionLabel: "Open your shared space",
          url: `${env.APP_URL}/journey`,
        });
      }

      return reply.code(201).send({ relationshipId: relationship.id });
    },
  );

  server.post<{ Params: { relationshipId: string } }>(
    "/api/journey/relationships/:relationshipId/leave",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      if (!(await isRelationshipMember(request.params.relationshipId, user.id))) {
        return sendError(reply, 404, "Relationship space not found.");
      }

      await prisma.relationship.update({
        where: { id: request.params.relationshipId },
        data: { status: "ENDED" },
      });

      return { left: true };
    },
  );
}
