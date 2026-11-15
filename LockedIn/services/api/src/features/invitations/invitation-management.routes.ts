import type { FastifyInstance } from "fastify";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { listSentInvitations, withdrawInvitation } from "./invitation-status.service.js";
import { blockInvitationSender, listInvitationBlocks, unblockInvitations } from "./invitation-blocks.service.js";
const validCursor = (value: unknown) => value === undefined || typeof value === "string" && value.length > 0 && value.length <= 128;
export async function registerInvitationManagementRoutes(server: FastifyInstance) {
    server.get<{
        Querystring: {
            before?: string;
        };
    }>("/api/journey/invites/sent", async (request, reply) => {
        reply.header("Cache-Control", "private, no-store");
        const user = await requireUser(request, reply);
        if (!user)
            return;
        if (!validCursor(request.query.before))
            return sendError(reply, 400, "Invalid invitation cursor.");
        const result = await listSentInvitations(user.id, request.query.before);
        if (!result.ok)
            return sendError(reply, result.status, result.error);
        return { items: result.items, nextCursor: result.nextCursor };
    });
    server.post<{
        Params: {
            id: string;
        };
    }>("/api/journey/invites/:id/withdraw", async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user)
            return;
        const result = await withdrawInvitation(request.params.id, user.id);
        if (!result.ok)
            return sendError(reply, result.status, result.error);
        return { withdrawn: true };
    });
    server.post<{
        Params: {
            token: string;
        };
    }>("/api/journey/invites/:token/block", async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user)
            return;
        const result = await blockInvitationSender(request.params.token, user);
        if (!result.ok)
            return sendError(reply, result.status, result.error);
        return { id: result.id };
    });
    server.get<{
        Querystring: {
            before?: string;
        };
    }>("/api/journey/invitation-blocks", async (request, reply) => {
        reply.header("Cache-Control", "private, no-store");
        const user = await requireUser(request, reply);
        if (!user)
            return;
        if (!validCursor(request.query.before))
            return sendError(reply, 400, "Invalid invitation cursor.");
        const result = await listInvitationBlocks(user.id, request.query.before);
        if (!result.ok)
            return sendError(reply, result.status, result.error);
        return { items: result.items, nextCursor: result.nextCursor };
    });
    server.delete<{
        Params: {
            id: string;
        };
    }>("/api/journey/invitation-blocks/:id", async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user)
            return;
        const result = await unblockInvitations(request.params.id, user.id);
        if (!result.ok)
            return sendError(reply, result.status, result.error);
        return { unblocked: true };
    });
}
