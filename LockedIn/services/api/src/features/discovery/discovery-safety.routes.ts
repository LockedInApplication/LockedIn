import type { FastifyInstance } from "fastify";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { requireDiscoveryMutation } from "./discovery.http.js";
import { respondDiscovery } from "./discovery-connection.routes.js";
import { discoveryBlockSchema, discoveryConnectionParams, discoveryConnectionQuery, discoveryReportSchema, discoveryRestoreSchema, discoveryReviewSchema, emptyDiscoverySchema } from "./discovery.schemas.js";
import { blockDiscoveryContact, listDiscoveryBlocks, reportDiscoveryContent, unblockDiscoveryContact } from "./discovery-safety.service.js";
import { listDiscoveryReports, restoreDiscoveryAccount, reviewDiscoveryReport } from "./discovery-moderation.service.js";
export async function registerDiscoverySafetyRoutes(server: FastifyInstance) {
  server.post("/api/discovery/blocks", { config: { discoveryValidation: { body: discoveryBlockSchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    return respondDiscovery(reply, actor.userId, await blockDiscoveryContact(actor.userId, discoveryBlockSchema.parse(request.body)));
  });
  server.post("/api/discovery/reports", { config: { discoveryValidation: { body: discoveryReportSchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    return respondDiscovery(reply, actor.userId, await reportDiscoveryContent(actor.userId, discoveryReportSchema.parse(request.body)));
  });
  for (const path of ["/api/discovery/blocks", "/api/discovery/moderation/reports"]) server.get(path, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    const parsed = discoveryConnectionQuery.safeParse(request.query); if (!parsed.success) return sendError(reply, 400, "Please check your request.");
    return respondDiscovery<unknown>(reply, user.id, path.endsWith("/blocks") ? await listDiscoveryBlocks(user.id, parsed.data.before) : await listDiscoveryReports(user.id, parsed.data.before));
  });
  server.delete("/api/discovery/blocks/:id", { config: { discoveryValidation: { body: emptyDiscoverySchema, params: discoveryConnectionParams } } }, async (request, reply) => {
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    return respondDiscovery(reply, actor.userId, await unblockDiscoveryContact(actor.userId, discoveryConnectionParams.parse(request.params).id));
  });
  server.post("/api/discovery/moderation/reports/:id/review", { config: { discoveryValidation: { body: discoveryReviewSchema, params: discoveryConnectionParams } } }, async (request, reply) => {
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    return respondDiscovery(reply, actor.userId, await reviewDiscoveryReport(actor.userId, discoveryConnectionParams.parse(request.params).id, discoveryReviewSchema.parse(request.body)));
  });
  server.post("/api/discovery/moderation/profiles/:id/restore", { config: { discoveryValidation: { body: discoveryRestoreSchema, params: discoveryConnectionParams } } }, async (request, reply) => {
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    return respondDiscovery(reply, actor.userId, await restoreDiscoveryAccount(actor.userId, discoveryConnectionParams.parse(request.params).id, discoveryRestoreSchema.parse(request.body).requestId));
  });
}
