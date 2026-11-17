import type { FastifyInstance } from "fastify";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { requireDiscoveryMutation } from "./discovery.http.js";
import { respondDiscovery } from "./discovery-connection.routes.js";
import { buildReadinessSchema, discoveryConnectionParams, emptyDiscoverySchema, privateReflectionSchema } from "./discovery.schemas.js";
import { getPrivateReflection, savePrivateReflection } from "./discovery-reflection.service.js";
import { setBuildReadiness } from "./discovery-promotion.service.js";
export async function registerDiscoveryResponseRoutes(server: FastifyInstance) {
  server.post("/api/discovery/connections/:id/readiness", { config: { discoveryValidation: { body: buildReadinessSchema, params: discoveryConnectionParams } } }, async (request, reply) => {
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    return respondDiscovery(reply, actor.userId, await setBuildReadiness(actor.userId, discoveryConnectionParams.parse(request.params).id, buildReadinessSchema.parse(request.body)));
  });
  server.get("/api/discovery/reflection", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!emptyDiscoverySchema.safeParse(request.query).success) return sendError(reply, 400, "Please check your reflection request.");
    return respondDiscovery(reply, user.id, await getPrivateReflection(user.id));
  });
  server.put("/api/discovery/reflection", { config: { discoveryValidation: { body: privateReflectionSchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    return respondDiscovery(reply, actor.userId, await savePrivateReflection(actor.userId, privateReflectionSchema.parse(request.body)));
  });
}
