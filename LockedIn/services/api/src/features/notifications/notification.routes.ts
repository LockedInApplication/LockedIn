import type { FastifyInstance } from "fastify";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { listNotifications, markNotificationRead } from "./notification.repository.js";
import { notificationBroker } from "./notification.broker.js";
import { registerStream } from "./notification.stream.js";
const validId = (value: string) => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
export async function registerNotificationRoutes(server: FastifyInstance) {
    const openStream = registerStream(server);
    server.get<{
        Querystring: {
            before?: string;
        };
    }>("/api/journey/notifications", async (request, reply) => {
        reply.header("Cache-Control", "private, no-store");
        const user = await requireUser(request, reply);
        if (!user)
            return;
        const before = request.query.before;
        if (before !== undefined && !validId(before))
            return sendError(reply, 400, "Invalid notification cursor.");
        return listNotifications(user.id, before ? BigInt(before) : undefined);
    });
    server.put<{
        Params: {
            id: string;
        };
    }>("/api/journey/notifications/:id/read", async (request, reply) => {
        reply.header("Cache-Control", "private, no-store");
        const user = await requireUser(request, reply);
        if (!user)
            return;
        if (!validId(request.params.id))
            return sendError(reply, 400, "Invalid notification ID.");
        if (!await markNotificationRead(user.id, BigInt(request.params.id)))
            return sendError(reply, 404, "Notification not found.");
        notificationBroker.publish(user.id, false);
        return { read: true };
    });
    server.get("/api/journey/notifications/stream", async (request, reply) => {
        const user = await requireUser(request, reply);
        if (!user)
            return;
        return openStream(request, reply, user.id);
    });
}
