import type { FastifyInstance } from "fastify";
import { requireUser } from "../../lib/journey-http.js";
import { getDiscoveryConfig } from "../../config/env.js";
import { getDiscoveryCapabilities } from "./discovery.policy.js";
import { registerDiscoveryProfileRoutes } from "./discovery-profile.routes.js";
import { registerDiscoveryConnectionRoutes } from "./discovery-connection.routes.js";
import { discoveryTopics } from "./discovery-topics.js";
import { registerDiscoveryResponseRoutes } from "./discovery-response.routes.js";
import { registerDiscoverySafetyRoutes } from "./discovery-safety.routes.js";
import { photoCapabilities } from "./photos/photo.config.js";

export async function registerDiscoveryRoutes(server: FastifyInstance): Promise<void> {
  await registerDiscoveryProfileRoutes(server);
  await registerDiscoveryConnectionRoutes(server);
  await registerDiscoveryResponseRoutes(server);
  await registerDiscoverySafetyRoutes(server);
  server.get("/api/discovery/me", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply);
    if (!user) return;
    const capabilities = await getDiscoveryCapabilities({ userId: user.id, emailVerified: user.emailVerified });
    return { ownerId: user.id, value: { ...capabilities, photos: photoCapabilities(), areas: capabilities.canDiscover ? getDiscoveryConfig().areas : [], topics: capabilities.canDiscover ? discoveryTopics : [] } };
  });
}
