import type { FastifyInstance, FastifyReply } from "fastify";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { requireDiscoveryMutation } from "./discovery.http.js";
import { discoveryCandidatesQuery, discoveryDraftSchema, discoveryProfileParams, discoveryPublishSchema, discoveryVisibilitySchema, emptyDiscoverySchema } from "./discovery.schemas.js";
import { getOwnDiscoveryProfile, publishDiscoveryProfile, saveDiscoveryProfileDraft, setDiscoveryPaused } from "./discovery-profile.service.js";
import { getVisibleDiscoveryProfile, listDiscoveryCandidates } from "./discovery-candidates.service.js";
import type { DiscoveryResult } from "./discovery.types.js";

function respond<T>(reply: FastifyReply, ownerId: string, result: DiscoveryResult<T>) {
  if (!result.ok) {
    if (result.retryAfter) reply.header("Retry-After", result.retryAfter);
    return sendError(reply, result.status, result.error);
  }
  return { ownerId, value: result.value };
}
export async function registerDiscoveryProfileRoutes(server: FastifyInstance) {
  server.get("/api/discovery/profile", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!emptyDiscoverySchema.safeParse(request.query).success) return sendError(reply, 400, "Please check your discovery request.");
    return respond(reply, user.id, await getOwnDiscoveryProfile(user.id));
  });
  server.put("/api/discovery/profile", { config: { discoveryValidation: { body: discoveryDraftSchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    const context = await requireDiscoveryMutation(request, reply); if (!context) return;
    const { revision, ...input } = discoveryDraftSchema.parse(request.body);
    return respond(reply, context.userId, await saveDiscoveryProfileDraft(context.userId, input, revision));
  });
  server.post("/api/discovery/profile/publish", { config: { discoveryValidation: { body: discoveryPublishSchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    const context = await requireDiscoveryMutation(request, reply); if (!context) return;
    const input = discoveryPublishSchema.parse(request.body);
    return respond(reply, context.userId, await publishDiscoveryProfile(context.userId, input.draftRevision, input.adultAttested));
  });
  server.post("/api/discovery/profile/visibility", { config: { discoveryValidation: { body: discoveryVisibilitySchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    const context = await requireDiscoveryMutation(request, reply); if (!context) return;
    return respond(reply, context.userId, await setDiscoveryPaused(context.userId, discoveryVisibilitySchema.parse(request.body).paused));
  });
  server.get("/api/discovery/candidates", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    const parsed = discoveryCandidatesQuery.safeParse(request.query);
    if (!parsed.success) return sendError(reply, 400, "Please check your discovery search.");
    const search = "areaId" in parsed.data ? { mode: "city" as const, areaId: parsed.data.areaId } : { mode: parsed.data.mode };
    return respond(reply, user.id, await listDiscoveryCandidates(user.id, search, parsed.data.before));
  });
  server.get("/api/discovery/profiles/:profileId", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    const parsed = discoveryProfileParams.safeParse(request.params);
    if (!parsed.success || !emptyDiscoverySchema.safeParse(request.query).success) return sendError(reply, 400, "Please check your discovery request.");
    return respond(reply, user.id, await getVisibleDiscoveryProfile(user.id, parsed.data.profileId));
  });
}
