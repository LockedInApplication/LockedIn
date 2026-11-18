import type { FastifyInstance, FastifyReply } from "fastify";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { requireDiscoveryMutation } from "./discovery.http.js";
import { discoveryConnectionParams, discoveryConnectionQuery, discoveryInvitationSchema, emptyDiscoverySchema } from "./discovery.schemas.js";
import { closeDiscoveryConnection, getDiscoveryConnection, listDiscoveryConnections, respondDiscoveryInvitation, sendDiscoveryInvitation, withdrawDiscoveryInvitation } from "./discovery-connection.service.js";
import type { DiscoveryResult } from "./discovery.types.js";
import { getConnectedProfile } from './discovery-connected-profile.service.js';

export function respondDiscovery<T>(reply: FastifyReply, ownerId: string, result: DiscoveryResult<T>) {
  if (!result.ok) { if (result.retryAfter) reply.header("Retry-After", result.retryAfter); return reply.code(result.status).send({ error: result.error, ...(result.conversationId ? { conversationId: result.conversationId } : {}) }); }
  return { ownerId, value: result.value };
}
export async function registerDiscoveryConnectionRoutes(server: FastifyInstance) {
  server.get('/api/discovery/connections/:id/profile', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const user = await requireUser(request, reply); if (!user) return;
    const params = discoveryConnectionParams.safeParse(request.params);
    if (!params.success || !emptyDiscoverySchema.safeParse(request.query).success) return sendError(reply, 400, 'Please check your profile request.');
    return respondDiscovery(reply, user.id, await getConnectedProfile(user.id, params.data.id));
  });
  server.post("/api/discovery/connections", { config: { discoveryValidation: { body: discoveryInvitationSchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    const context = await requireDiscoveryMutation(request, reply); if (!context) return;
    return respondDiscovery(reply, context.userId, await sendDiscoveryInvitation(context.userId, discoveryInvitationSchema.parse(request.body)));
  });
  server.get("/api/discovery/connections", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    const query = discoveryConnectionQuery.safeParse(request.query); if (!query.success) return sendError(reply, 400, "Please check your connections request.");
    return respondDiscovery(reply, user.id, await listDiscoveryConnections(user.id, query.data.before));
  });
  server.get("/api/discovery/connections/:id", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    const params = discoveryConnectionParams.safeParse(request.params);
    if (!params.success || !emptyDiscoverySchema.safeParse(request.query).success) return sendError(reply, 400, "Please check your connections request.");
    return respondDiscovery(reply, user.id, await getDiscoveryConnection(user.id, params.data.id));
  });
  for (const action of ["accept", "decline", "withdraw", "close"] as const) server.post(`/api/discovery/connections/:id/${action}`, { config: { discoveryValidation: { body: emptyDiscoverySchema, params: discoveryConnectionParams } } }, async (request, reply) => {
    const context = await requireDiscoveryMutation(request, reply); if (!context) return;
    const { id } = discoveryConnectionParams.parse(request.params);
    const result = action === "withdraw" ? await withdrawDiscoveryInvitation(context.userId, id) : action === "close" ? await closeDiscoveryConnection(context.userId, id) : await respondDiscoveryInvitation(context.userId, id, action);
    return respondDiscovery(reply, context.userId, result);
  });
}
