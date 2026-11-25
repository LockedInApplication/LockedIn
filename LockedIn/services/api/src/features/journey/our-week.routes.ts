import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { OurWeekUnavailable, readOurWeek, unavailableRecap } from "./our-week.service.js";

const params = z.strictObject({ relationshipId: z.uuid() });

export async function registerOurWeekRoutes(server: FastifyInstance, now: () => Date = () => new Date()) {
  server.get("/api/journey/relationships/:relationshipId/our-week", { exposeHeadRoute: false }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff");
    const actor = await requireUser(request, reply);
    if (!actor) return;
    if (request.headers["x-together-owner"] !== actor.id) {
      return sendError(reply, 409, "Your account changed. Reload Together before opening the recap.");
    }
    const parsed = params.safeParse(request.params);
    if (!parsed.success) return sendError(reply, 404, unavailableRecap().message);
    try {
      return await readOurWeek(parsed.data.relationshipId, actor.id, now());
    } catch (error) {
      if (error instanceof OurWeekUnavailable) return sendError(reply, 404, error.message);
      throw error;
    }
  });
}
