import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { sendError } from "../../lib/journey-http.js";
import { lockInvitationUsers } from "../invitations/invitation-access.service.js";
import { respondDiscovery } from "./discovery-connection.routes.js";
import { requireDiscoveryMutation } from "./discovery.http.js";
import { configuredArea, emptyDiscoverySchema } from "./discovery.schemas.js";
import { isDiscoveryLockedIn } from "./discovery-lock-in.js";
import { hasStoredDiscoveryPublication, isDiscoveryAdmitted } from "./discovery-profile.service.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";
import { cellForDevice, deviceLocationSchema, discoveryLocationMarkets, discoveryLocationPolicy, locationCheckMs, locationStorageId, marketForDevice, publicDiscoveryLocation } from "./discovery-location.js";

export function registerDiscoveryLocationRoutes(server: FastifyInstance) {
  server.post("/api/discovery/location-check", { bodyLimit: 1024, config: { discoveryValidation: { body: deviceLocationSchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const actor = await requireDiscoveryMutation(request, reply); if (!actor) return;
    const policy = discoveryLocationPolicy();
    if (policy.mode === "legacy") return sendError(reply, 404, "Location check is unavailable.");
    if (policy.mode !== "metro" && policy.mode !== "worldwide") return sendError(reply, 503, "Location check is temporarily unavailable.");
    const position = deviceLocationSchema.parse(request.body);
    const markets = policy.mode === "metro" ? discoveryLocationMarkets() : [];
    if (policy.mode === "metro" && !markets.length) return sendError(reply, 503, "Location check is temporarily unavailable.");
    const areaId = policy.mode === "worldwide" ? cellForDevice(position) : marketForDevice(position, markets);
    const result = await prisma.$transaction(async tx => {
      await lockInvitationUsers(tx, [actor.userId]);
      const profile = await tx.discoveryProfile.findUnique({ where: { ownerId: actor.userId } });
      if (!await isDiscoveryAdmitted(tx, actor.userId, profile) || !hasStoredDiscoveryPublication(profile) || await isDiscoveryLockedIn(tx, actor.userId)) {
        return { ok: false as const, status: 403, error: "Publish your Discovery profile before confirming location." };
      }
      if (policy.mode === "metro" && !configuredArea(profile.publishedAreaId ?? "")) {
        return { ok: false as const, status: 403, error: "Publish your Discovery profile with a supported city before confirming location." };
      }
      const quota = await consumeDiscoveryQuota(tx, actor.userId, "locationCheck");
      if (!quota.ok) return quota;
      if (!areaId) {
        await tx.discoveryLocationCheck.deleteMany({ where: { profileId: profile.id } });
        return { ok: true as const, value: publicDiscoveryLocation(policy, null) };
      }
      const expiresAt = new Date(Date.now() + locationCheckMs);
      const storageId = locationStorageId(policy, areaId);
      await tx.discoveryLocationCheck.upsert({ where: { profileId: profile.id }, create: { profileId: profile.id, areaId: storageId, expiresAt }, update: { areaId: storageId, expiresAt } });
      return { ok: true as const, value: publicDiscoveryLocation(policy, { areaId, expiresAt }) };
    });
    return respondDiscovery(reply, actor.userId, result);
  });
}
