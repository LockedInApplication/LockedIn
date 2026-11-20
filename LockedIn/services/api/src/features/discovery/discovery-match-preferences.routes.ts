import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { sendError } from "../../lib/journey-http.js";
import { respondDiscovery } from "./discovery-connection.routes.js";
import { requireDiscoveryIdentity, requireDiscoveryMutation } from "./discovery.http.js";
import { matchPreferencesSchema } from "./discovery-match-preferences.schemas.js";
import { getMatchPreferences, pruneDiscoveryMatchPreferenceGuards, removeMatchPreferences, saveMatchPreferences } from "./discovery-match-preferences.service.js";

export function registerMatchPreferencesRoutes(server: FastifyInstance) {
  const url = "/api/discovery/match-preferences";
  server.route({
    method: ["GET", "PUT", "DELETE"], url, bodyLimit: 1024,
    errorHandler(error, request, reply) {
      reply.header("Cache-Control", "private, no-store");
      const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
      if (status === 500) request.log.error("Discovery matching settings request failed");
      return sendError(reply, status, "Could not complete the Discovery matching settings request.");
    },
    async handler(request, reply) {
      const actor = await (request.method === "DELETE" ? requireDiscoveryMutation : requireDiscoveryIdentity)(request, reply);
      if (!actor) return;
      const { userId } = actor;
      if (request.method === "GET") return respondDiscovery(reply, userId, await getMatchPreferences(userId));
      if (request.method === "DELETE") return respondDiscovery(reply, userId, await removeMatchPreferences(userId));
      const body = matchPreferencesSchema.safeParse(request.body);
      if (!body.success) return sendError(reply, 400, "Check your birthday and select who you’re open to meeting.");
      return respondDiscovery(reply, userId, await saveMatchPreferences(userId, body.data));
    },
  });

  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  function sweep() {
    if (pending) return;
    pending = pruneDiscoveryMatchPreferenceGuards(prisma, new Date())
      .catch(() => server.log.error("Discovery matching expiry sweep failed"))
      .finally(() => { pending = undefined; });
  }
  server.addHook("onReady", async () => { sweep(); timer = setInterval(sweep, 60 * 60 * 1000).unref(); });
  server.addHook("onClose", async () => { if (timer) clearInterval(timer); await pending; });
}
