import { requireUser, sendError } from "../lib/journey-http.js";
import { sendJourneyEmailSafely } from "../features/journey-notifications/journey-email.service.js";
import { conversationPacks, getConversationPack } from "../features/conversations/conversation.catalog.js";
import { registerConversationRoutes } from "../features/conversations/conversation.routes.js";
import { registerCheckInRoutes } from "../features/check-ins/check-in.routes.js";
import { buildSessionView, buildCheckInSnapshot, reflectionOpensAt } from "../features/check-ins/check-in.view.js";
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

const nextStepSchema = z.object({
  title: z.string().trim().min(3).max(120),
  details: z.string().trim().max(600).optional(),
  targetDate: z.string().date().optional(),
});

const reflectionSchema = z.object({
  outcome: z.enum(["COMPLETED", "CHANGED", "PAUSED", "NOT_RELEVANT"]),
  note: z.string().trim().max(600).optional(),
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

  server.post<{ Params: { sessionId: string } }>(
    "/api/journey/sessions/:sessionId/next-steps",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const session = await prisma.intentionSession.findUnique({
        where: { id: request.params.sessionId },
      });
      if (!session || !(await isRelationshipMember(session.relationshipId, user.id))) {
        return sendError(reply, 404, "Intention session not found.");
      }
      if (session.status === "ARCHIVED") {
        return sendError(reply, 409, "Add new roadmap ideas from the current check-in.");
      }

      const revealCount = await prisma.intentionResponse.count({
        where: { sessionId: session.id, revealConsentedAt: { not: null } },
      });
      if (revealCount !== 2) {
        return sendError(reply, 409, "Both people must consent before choosing a shared next step.");
      }

      const parsed = nextStepSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Add a clear, specific next step.");

      const step = await prisma.sharedNextStep.create({
        data: {
          sessionId: session.id,
          proposedById: user.id,
          title: parsed.data.title,
          details: parsed.data.details || null,
          targetDate: parsed.data.targetDate
            ? new Date(`${parsed.data.targetDate}T12:00:00.000Z`)
            : null,
        },
      });

      const partner = await prisma.relationshipMember.findFirst({
        where: { relationshipId: session.relationshipId, userId: { not: user.id } },
        include: { user: true },
      });
      if (partner?.user.email) {
        await sendJourneyEmailSafely(request, {
          to: partner.user.email,
          name: partner.user.name,
          subject: "A new LockedIn roadmap idea is waiting",
          heading: "Your partner suggested a next step.",
          message: "Review it privately. It becomes shared only if you choose to accept it.",
          actionLabel: "Review the suggestion",
          url: `${env.APP_URL}/journey`,
        });
      }

      return reply.code(201).send({ id: step.id });
    },
  );

  server.post<{ Params: { stepId: string } }>(
    "/api/journey/next-steps/:stepId/accept",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const step = await prisma.sharedNextStep.findUnique({
        where: { id: request.params.stepId },
        include: { session: true },
      });
      if (!step || !(await isRelationshipMember(step.session.relationshipId, user.id))) {
        return sendError(reply, 404, "Next step not found.");
      }
      if (step.proposedById === user.id) {
        return sendError(reply, 400, "Your partner needs to accept this proposal.");
      }
      if (step.status !== "PROPOSED") {
        return sendError(reply, 409, "This proposal is no longer waiting for acceptance.");
      }

      await prisma.$transaction([
        prisma.sharedNextStep.update({
          where: { id: step.id },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        }),
        prisma.intentionSession.update({
          where: { id: step.sessionId },
          data: { status: "ACTION_CHOSEN" },
        }),
      ]);

      const proposer = await prisma.user.findUnique({ where: { id: step.proposedById } });
      if (proposer?.email) {
        await sendJourneyEmailSafely(request, {
          to: proposer.email,
          name: proposer.name,
          subject: "Your LockedIn next step was accepted",
          heading: "A new step was added to your shared roadmap.",
          message: `Your partner accepted “${step.title}”. Its revisit date and reflections remain private until the right time.`,
          actionLabel: "View your roadmap",
          url: `${env.APP_URL}/journey`,
        });
      }

      return { accepted: true };
    },
  );

  server.post<{ Params: { stepId: string } }>(
    "/api/journey/next-steps/:stepId/reflections",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const step = await prisma.sharedNextStep.findUnique({
        where: { id: request.params.stepId },
        include: { session: true },
      });
      if (!step || !(await isRelationshipMember(step.session.relationshipId, user.id))) {
        return sendError(reply, 404, "Next step not found.");
      }
      if (!["ACCEPTED", "COMPLETED", "PAUSED"].includes(step.status)) {
        return sendError(reply, 409, "Accept the shared next step before reflecting on it.");
      }

      const reflectionOpening = reflectionOpensAt(step.targetDate);
      if (reflectionOpening && reflectionOpening.getTime() > Date.now()) {
        return sendError(
          reply,
          409,
          `Reflection opens on ${reflectionOpening.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}.`,
        );
      }

      const parsed = reflectionSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Choose a reflection outcome.");

      await prisma.reflection.upsert({
        where: { nextStepId_userId: { nextStepId: step.id, userId: user.id } },
        update: { outcome: parsed.data.outcome, note: parsed.data.note || null },
        create: {
          nextStepId: step.id,
          userId: user.id,
          outcome: parsed.data.outcome,
          note: parsed.data.note || null,
        },
      });

      const reflections = await prisma.reflection.findMany({ where: { nextStepId: step.id } });
      if (reflections.length === 2) {
        const finalStatus = reflections.every((item) => item.outcome === "COMPLETED")
          ? "COMPLETED"
          : reflections.some((item) => item.outcome === "CHANGED")
            ? "REVISED"
            : "PAUSED";

        const otherActiveSteps = await prisma.sharedNextStep.count({
          where: {
            sessionId: step.sessionId,
            id: { not: step.id },
            status: "ACCEPTED",
          },
        });

        await prisma.$transaction([
          prisma.sharedNextStep.update({
            where: { id: step.id },
            data: { status: finalStatus },
          }),
          prisma.intentionSession.update({
            where: { id: step.sessionId },
            data: { status: otherActiveSteps > 0 ? "ACTION_CHOSEN" : "REFLECTED" },
          }),
        ]);
      }

      return { saved: true };
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
