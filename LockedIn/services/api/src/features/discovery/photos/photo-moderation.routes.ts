import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser, sendError } from "../../../lib/journey-http.js";
import { requireDiscoveryMutation } from "../discovery.http.js";
import { registerPhotoMediaRoutes } from "./photo-media.routes.js";
import { appealPhoto, listPhotoReviews, reviewPhoto } from "./photo-moderation.service.js";
import { photoDecisionRequestSchema, photoParamsSchema, photoReviewSchema } from "./photo.schemas.js";
import type { PhotoProvider } from "./photo.types.js";
import { respondPhoto } from "./photo-upload.routes.js";

export function registerPhotoModerationRoutes(server: FastifyInstance, provider: PhotoProvider) {
  registerPhotoMediaRoutes(server, provider, "moderation");
  server.get("/api/discovery/moderation/photos", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    const query = z.strictObject({ before: z.string().uuid().optional() }).safeParse(request.query);
    if (!query.success) return sendError(reply, 400, "Invalid review request.");
    return respondPhoto(reply, user.id, await listPhotoReviews(user.id, query.data.before));
  });
  server.post("/api/discovery/moderation/photos/:id/review", { config: { discoveryValidation: { body: photoReviewSchema, params: photoParamsSchema } } }, async (request, reply) => {
    const context = await requireDiscoveryMutation(request, reply); if (!context) return;
    return respondPhoto(reply, context.userId, await reviewPhoto(context.userId, photoParamsSchema.parse(request.params).id, photoReviewSchema.parse(request.body), provider));
  });
  server.post("/api/discovery/photos/:id/appeal", { config: { discoveryValidation: { body: photoDecisionRequestSchema, params: photoParamsSchema } } }, async (request, reply) => {
    const context = await requireDiscoveryMutation(request, reply); if (!context) return;
    const { requestId, decisionRevision } = photoDecisionRequestSchema.parse(request.body);
    return respondPhoto(reply, context.userId, await appealPhoto(context.userId, photoParamsSchema.parse(request.params).id, requestId, decisionRevision));
  });
}
