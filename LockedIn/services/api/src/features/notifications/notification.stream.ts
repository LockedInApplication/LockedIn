import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getAuthenticatedUser } from "../../lib/session.js";
import { notificationBroker } from "./notification.broker.js";
import { notificationFingerprint } from "./notification.repository.js";
import { inAppActivityAllowed } from "./notification-preferences.js";
import { prisma } from "../../lib/prisma.js";
export function registerStream(server: FastifyInstance) {
    const streams = new Set<Readable>();
    server.addHook("preClose", async () => { for (const stream of streams)
        stream.destroy(); });
    return async function openStream(request: FastifyRequest, reply: FastifyReply, userId: string) {
        let fingerprint = await notificationFingerprint(userId);
        const stream = new Readable({ read() { } });
        const emit = (event: string, data: object) => {
            if (stream.destroyed)
                return;
            // Disconnect slow consumers rather than growing an unbounded socket buffer.
            if (!stream.push(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
                stream.destroy();
        };
        const unsubscribe = notificationBroker.subscribe(userId, (activity, kind) => {
            if (kind === "chat") emit("discovery-chat-changed", {});
            else emit("notifications-changed", { activity });
        });
        if (!unsubscribe)
            return reply.code(429).header("Retry-After", "15").send({ error: "Too many notification connections." });
        streams.add(stream);
        let checking = false;
        const timer = setInterval(async () => {
            if (checking || stream.destroyed)
                return;
            checking = true;
            try {
                const user = await getAuthenticatedUser(request);
                if (!user || user.id !== userId) {
                    emit("auth-expired", {});
                    stream.push(null);
                    return;
                }
                const next = await notificationFingerprint(userId);
                if (stream.destroyed)
                    return;
                if (next !== fingerprint) {
                    const activity = next.split(":")[1] !== fingerprint.split(":")[1] && await inAppActivityAllowed(prisma,userId);
                    fingerprint = next;
                    emit("notifications-changed", { activity });
                }
                else
                    stream.push(": heartbeat\n\n");
            }
            catch {
                stream.destroy();
            }
            finally {
                checking = false;
            }
        }, 10000);
        timer.unref();
        const cleanup = () => { clearInterval(timer); unsubscribe(); streams.delete(stream); };
        stream.once("close", cleanup);
        request.raw.once("aborted", () => stream.destroy());
        reply.raw.once("close", () => stream.destroy());
        reply.header("Content-Type", "text/event-stream");
        reply.header("Cache-Control", "private, no-store, no-transform");
        reply.header("X-Accel-Buffering", "no");
        emit("notifications-changed", { activity: false });
        return reply.send(stream);
    };
}
