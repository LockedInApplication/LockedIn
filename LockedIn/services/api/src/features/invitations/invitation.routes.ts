import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { env } from "../../config/env.js";
import { getActiveRelationship } from "../relationships/relationship-access.service.js";
import { sendJourneyEmailSafely } from "../journey-notifications/journey-email.service.js";
import { inviteSchema } from "./invitation.schemas.js";
import { acceptInvitation } from "./invitation.service.js";

export async function registerInvitationRoutes(server: FastifyInstance) {
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

      const relationship = await acceptInvitation(invite.id, invite.inviterId, user.id);

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

}
