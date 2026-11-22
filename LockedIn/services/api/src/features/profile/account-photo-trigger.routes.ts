import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";

export const cleanupTriggerPath = "/internal/account-photo-cleanup/tick";

export async function registerAccountPhotoTrigger(server: FastifyInstance, options: {
  runDeletionRound?: () => Promise<void> | null;
}) {
  server.post(cleanupTriggerPath, { bodyLimit: 128, logLevel: "warn" }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const secret = process.env.ACCOUNT_PHOTO_CLEANUP_TRIGGER_SECRET;
    const auth = request.headers.authorization;
    if (!secret || !/^[0-9a-f]{64}$/.test(secret) || !auth || !/^Bearer [0-9a-f]{64}$/.test(auth) ||
        !timingSafeEqual(Buffer.from(secret), Buffer.from(auth.slice(7)))) return reply.code(404).send();
    if (request.url !== cleanupTriggerPath || request.body !== undefined) return reply.code(400).send();
    try {
      const round = options.runDeletionRound?.();
      if (!round) return reply.code(503).send();
      await round;
      return reply.header("X-LockedIn-Cleanup", "completed").code(204).send();
    } catch {
      request.log.warn("Scheduled account photo cleanup could not finish its round");
      return reply.code(503).send();
    }
  });
}
