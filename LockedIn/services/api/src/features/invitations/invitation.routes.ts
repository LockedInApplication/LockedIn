import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { env } from "../../config/env.js";
import { getActiveRelationship } from "../relationships/relationship-access.service.js";
import { sendJourneyEmailSafely } from "../journey-notifications/journey-email.service.js";
import { inviteSchema } from "./invitation.schemas.js";
import { acceptInvitation, createInvitation, reviewInvitation, declineInvitation } from "./invitation.service.js";
import {registerInvitationManagementRoutes} from "./invitation-management.routes.js";
export async function registerInvitationRoutes(server: FastifyInstance) {
    await registerInvitationManagementRoutes(server);
    server.post("/api/journey/invites", async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user)
            return;
        const parsed = inviteSchema.safeParse(request.body);
        if (!parsed.success)
            return sendError(reply, 400, "Enter a valid partner email.");
        if (parsed.data.email === user.email.toLowerCase()) {
            return sendError(reply, 400, "Invite a partner using a different email address.");
        }
        if (await getActiveRelationship(user.id)) {
            return sendError(reply, 409, "You already have an active relationship space.");
        }
        const result = await createInvitation(user.id, parsed.data.email);
        if (!result.ok)
            return sendError(reply, result.status, result.error);
        const { invite } = result;
        await sendJourneyEmailSafely(request, {
            to: parsed.data.email,
            subject: `${user.name ?? "Someone"} invited you to LockedIn`,
            heading: "A private relationship space is waiting for you.",
            message: `${user.name ?? "Your partner"} invited you to reflect privately and build a shared roadmap together.`,
            actionLabel: "Open private invitation",
            url: `${env.APP_URL}/journey?invite=${invite.token}`,
        });
        return reply.code(result.created ? 201 : 200).send({ token: invite.token, expiresAt: invite.expiresAt });
    });
    server.post<{
        Params: {
            token: string;
        };
    }>("/api/journey/invites/:token/accept", async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user)
            return;
        const invite = await prisma.relationshipInvite.findUnique({
            where: { token: request.params.token },
        });
        if (!invite) {
            return sendError(reply, 404, "This invitation is no longer available.");
        }
        if (invite.inviteeEmail?.toLowerCase() !== user.email.toLowerCase() &&
            invite.inviteeId !== user.id) {
            return sendError(reply, 404, "Invitation not found.");
        }
        const result = await acceptInvitation(invite.id, invite.inviterId, user.id);
        if (!result.ok)
            return sendError(reply, result.status, result.error);
        const { relationship } = result;
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
    });
    server.get<{
        Params: {
            reference: string;
        };
        Querystring: {
            by?: string;
        };
    }>("/api/journey/invites/:reference/review", async (request, reply) => {
        reply.header("Cache-Control", "private, no-store");
        const user = await requireUser(request, reply);
        if (!user)
            return;
        if (request.query.by !== undefined && request.query.by !== "id")
            return sendError(reply, 400, "Invalid invitation reference.");
        const result = await reviewInvitation(request.params.reference, user, request.query.by === "id");
        if (!result)
            return sendError(reply, 404, "Invitation not found.");
        return result;
    });
    server.post<{
        Params: {
            token: string;
        };
    }>("/api/journey/invites/:token/decline", async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user)
            return;
        const result = await declineInvitation(request.params.token, user);
        if (!result.ok)
            return sendError(reply, result.status, result.error);
        return { declined: true };
    });
}
