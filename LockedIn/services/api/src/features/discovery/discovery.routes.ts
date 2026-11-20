import type { FastifyInstance } from "fastify";
import { requireUser } from "../../lib/journey-http.js";
import { getDiscoveryConfig } from "../../config/env.js";
import { getDiscoveryCapabilities } from "./discovery.policy.js";
import { registerDiscoveryProfileRoutes } from "./discovery-profile.routes.js";
import { registerDiscoveryConnectionRoutes } from "./discovery-connection.routes.js";
import { discoveryChatEnabled, registerDiscoveryChatRoutes } from "./discovery-chat.routes.js";
import { discoveryTopics } from "./discovery-topics.js";
import { registerDiscoveryResponseRoutes } from "./discovery-response.routes.js";
import { registerDiscoverySafetyRoutes } from "./discovery-safety.routes.js";
import { photoCapabilities } from "./photos/photo.config.js";
import { getPhotoProvider } from "./photos/photo-provider.js";
import { registerPhotoUploadRoutes } from "./photos/photo-upload.routes.js";
import type { PhotoProvider } from "./photos/photo.types.js";
import { registerPhotoMediaRoutes } from "./photos/photo-media.routes.js";
import { registerPhotoModerationRoutes } from "./photos/photo-moderation.routes.js";
import { registerDiscoveryDistanceRoutes } from "./discovery-distance.routes.js";
import { getDiscoveryGeocoder, type DiscoveryGeocoder } from "./discovery-geocoding.js";
import { registerDiscoveryLocationRoutes } from "./discovery-location.routes.js";
import { registerMatchPreferencesRoutes } from "./discovery-match-preferences.routes.js";
import { discoveryMatchPreferencesRequired } from "./discovery-match-preferences.service.js";
import { currentDiscoveryLocation, discoveryLocationRequired, noLocation } from "./discovery-location.js";
import { prisma } from "../../lib/prisma.js";

export async function registerDiscoveryRoutes(server: FastifyInstance, options: { photoProvider?: PhotoProvider; discoveryGeocoder?: DiscoveryGeocoder } = {}): Promise<void> {
  const provider = options.photoProvider ?? getPhotoProvider();
  await server.register(scope => registerPhotoUploadRoutes(scope, provider));
  registerPhotoMediaRoutes(server, provider, "ordinary");
  registerPhotoModerationRoutes(server, provider);
  await registerDiscoveryProfileRoutes(server);
  await registerDiscoveryConnectionRoutes(server);
  registerDiscoveryChatRoutes(server);
  await registerDiscoveryResponseRoutes(server);
  await registerDiscoverySafetyRoutes(server);
  registerDiscoveryDistanceRoutes(server, options.discoveryGeocoder ?? getDiscoveryGeocoder());
  registerDiscoveryLocationRoutes(server);
  registerMatchPreferencesRoutes(server);
  server.get("/api/discovery/me", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply);
    if (!user) return;
    const capabilities = await getDiscoveryCapabilities({ userId: user.id, emailVerified: user.emailVerified });
    let location;
    if (discoveryLocationRequired() && capabilities.canDiscover) {
      const profile = await prisma.discoveryProfile.findUnique({ where: { ownerId: user.id }, select: { id: true } });
      const check = profile && await currentDiscoveryLocation(prisma, profile.id);
      location = check ? { required: true, areaId: check.areaId, expiresAt: check.expiresAt.toISOString() } : noLocation;
    }
    const matchingRequired = discoveryMatchPreferencesRequired();
    const matchingSettings = await prisma.discoveryMatchPreferences.findUnique({ where: { ownerId: user.id }, select: { revision: true } });
    const matching = matchingRequired ? { required: true as const, complete: !!matchingSettings, ...(matchingSettings ? { revision: matchingSettings.revision } : {}) } : undefined;
    return { ownerId: user.id, value: { ...capabilities, ...(location ? { location } : {}), ...(matching ? { matching } : matchingSettings ? { hasSavedMatchingSettings: true as const } : {}), chatEnabled: discoveryChatEnabled(), photos: photoCapabilities(), areas: capabilities.canManageProfile ? getDiscoveryConfig().areas : [], topics: capabilities.canDiscover ? discoveryTopics : [] } };
  });
}
