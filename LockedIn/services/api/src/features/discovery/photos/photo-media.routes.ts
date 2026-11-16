import type { FastifyInstance } from "fastify";
import { requireUser, sendError } from "../../../lib/journey-http.js";
import { emptyDiscoverySchema } from "../discovery.schemas.js";
import { readPhoto } from "./photo-access.service.js";
import { photoParamsSchema } from "./photo.schemas.js";
import type { PhotoProvider } from "./photo.types.js";

export function registerPhotoMediaRoutes(server: FastifyInstance, provider: PhotoProvider, purpose: "ordinary" | "moderation") {
  const prefix = purpose === "moderation" ? "/api/discovery/moderation/photos" : "/api/discovery/photos";
  server.get(`${prefix}/:id/media`, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff");
    const actor = await requireUser(request, reply); if (!actor) return;
    const parsed = photoParamsSchema.safeParse(request.params);
    if (!parsed.success || !emptyDiscoverySchema.safeParse(request.query).success) return sendError(reply, 404, "Photo not found.");
    const bytes = await readPhoto(actor.id, parsed.data.id, purpose, provider);
    if (!bytes) return sendError(reply, 404, "Photo not found.");
    return reply.type("image/jpeg").send(bytes);
  });
}
