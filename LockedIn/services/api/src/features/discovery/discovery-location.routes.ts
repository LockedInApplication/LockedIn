import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { sendError } from "../../lib/journey-http.js";
import { lockInvitationUsers } from "../invitations/invitation-access.service.js";
import { respondDiscovery } from "./discovery-connection.routes.js";
import { requireDiscoveryMutation } from "./discovery.http.js";
import { emptyDiscoverySchema } from "./discovery.schemas.js";
import { isDiscoveryLockedIn } from "./discovery-lock-in.js";
import { hasDiscoveryPublication, isDiscoveryAdmitted } from "./discovery-profile.service.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";
import { deviceLocationSchema, discoveryLocationMarkets, discoveryLocationRequired, locationCheckMs, marketForDevice, noLocation } from "./discovery-location.js";

export function registerDiscoveryLocationRoutes(server: FastifyInstance) {
  server.post("/api/discovery/location-check", { bodyLimit: 1024, config: { discoveryValidation: { body: deviceLocationSchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    if (!discoveryLocationRequired()) return sendError(reply, 404, "Location check is unavailable.");
    const markets = discoveryLocationMarkets();
    if (!markets.length) return sendError(reply, 503, "Location check is temporarily unavailable.");
    const areaId = marketForDevice(deviceLocationSchema.parse(request.body), markets);
    const result = await prisma.$transaction(async tx => {
      await lockInvitationUsers(tx, [actor.userId]);
      const profile = await tx.discoveryProfile.findUnique({ where: { ownerId: actor.userId } });
      if (!await isDiscoveryAdmitted(tx, actor.userId, profile) || !hasDiscoveryPublication(profile) || await isDiscoveryLockedIn(tx, actor.userId)) {
        return { ok: false as const, status: 403, error: "Publish your Discovery profile before confirming location." };
      }
      const quota = await consumeDiscoveryQuota(tx, actor.userId, "locationCheck");
      if (!quota.ok) return quota;
      if (!areaId) {
        await tx.discoveryLocationCheck.deleteMany({ where: { profileId: profile.id } });
        return { ok: true as const, value: noLocation };
      }
      const expiresAt = new Date(Date.now() + locationCheckMs);
      await tx.discoveryLocationCheck.upsert({ where: { profileId: profile.id }, create: { profileId: profile.id, areaId, expiresAt }, update: { areaId, expiresAt } });
      return { ok: true as const, value: { required: true, areaId, expiresAt: expiresAt.toISOString() } };
    });
    return respondDiscovery<{ required: boolean; areaId: string | null; expiresAt: string | null }>(reply, actor.userId, result);
  });
}
