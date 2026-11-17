import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { lockInvitationUsers } from "../invitations/invitation-access.service.js";
import { respondDiscovery } from "./discovery-connection.routes.js";
import { approximateDiscoveryPoint, discoveryDistanceMiles } from "./discovery-distance.js";
import type { DiscoveryGeocoder } from "./discovery-geocoding.js";
import { requireDiscoveryMutation } from "./discovery.http.js";
import { emptyDiscoverySchema } from "./discovery.schemas.js";
import { hasDiscoveryPublication, isDiscoveryAdmitted } from "./discovery-profile.service.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";

const endpoint = "/api/discovery/distance-preferences";
const searchSchema = z.strictObject({ query: z.string().trim().min(3).max(160).refine(text => !/[;\r\n]/u.test(text) && text.split(/\s+/u).length <= 20) });
const saveSchema = z.strictObject({ maxDistanceMiles: z.literal(discoveryDistanceMiles), locationToken: z.string().min(1).max(1024).optional() });
const point = z.strictObject({ owner: z.string(), expiresAt: z.number().int(), z: z.number().min(-90).max(90), x: z.number().min(-180).max(180), areaLabel: z.string().max(160).nullable() });
const denied = { ok: false as const, status: 403, error: "Publish your Discovery profile before setting a search location." };
const offline = { ok: false as const, status: 503, error: "Location search is unavailable right now." };
const view = (stored: { areaLabel: string | null; maxDistanceMiles: number } | null, configured: boolean) => ({
  configured, preference: stored ? { areaLabel: stored.areaLabel, maxDistanceMiles: stored.maxDistanceMiles } : null,
});
function key() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Discovery location tokens require the authentication secret");
  return createHmac("sha256", secret).update("lockedin-discovery-geocoding-v1").digest();
}
function encodeLocation(data: z.infer<typeof point>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const dataBytes = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), dataBytes]).toString("base64url");
}
function decodeLocation(token: string, owner: string) {
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.length <= 28 || bytes.toString("base64url") !== token) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const parsed = point.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")));
    return parsed.owner === owner && parsed.expiresAt > Date.now() ? { latitude: parsed.z, longitude: parsed.x, areaLabel: parsed.areaLabel } : null;
  } catch { return null; }
}

export function registerDiscoveryDistanceRoutes(server: FastifyInstance, geocode: DiscoveryGeocoder | null) {
  server.get(endpoint, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!emptyDiscoverySchema.safeParse(request.query).success) return sendError(reply, 400, "Please check your Discovery request.");
    const profile = await prisma.discoveryProfile.findUnique({ where: { ownerId: user.id }, select: { distancePreference: { select: { areaLabel: true, maxDistanceMiles: true } } } });
    return { ownerId: user.id, value: view(profile?.distancePreference ?? null, !!geocode) };
  });
  server.post(`${endpoint}/locations`, { config: { discoveryValidation: { body: searchSchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    const context = await requireDiscoveryMutation(request, reply); if (!context) return;
    const { userId } = context;
    const { query } = searchSchema.parse(request.body);
    if (!geocode) return respondDiscovery(reply, userId, offline);
    const quota = await prisma.$transaction(async tx => {
      await lockInvitationUsers(tx, [userId]);
      const profile = await tx.discoveryProfile.findUnique({ where: { ownerId: userId } });
      if (!await isDiscoveryAdmitted(tx, userId, profile) || !hasDiscoveryPublication(profile)) return denied;
      return consumeDiscoveryQuota(tx, userId, "locationLookup");
    });
    if (!quota.ok) return respondDiscovery(reply, userId, quota);
    try {
      const expiresAt = Date.now() + 10 * 60_000;
      const locations = (await geocode(query)).slice(0, 5).map(result => {
        const coarse = approximateDiscoveryPoint(result);
        return { label: result.label, token: encodeLocation({ owner: userId, expiresAt, z: coarse.latitude, x: coarse.longitude, areaLabel: result.areaLabel }) };
      });
      return { ownerId: userId, value: { locations } };
    } catch {
      // Never log the provider error: it can include the query or credential.
      return respondDiscovery(reply, userId, offline);
    }
  });
  server.put(endpoint, { config: { discoveryValidation: { body: saveSchema, params: emptyDiscoverySchema } } }, async (request, reply) => {
    const context = await requireDiscoveryMutation(request, reply); if (!context) return;
    const { userId } = context;
    const { locationToken, maxDistanceMiles } = saveSchema.parse(request.body);
    if (locationToken && !geocode) return respondDiscovery(reply, userId, offline);
    const location = locationToken ? decodeLocation(locationToken, userId) : null;
    if (locationToken && !location) return sendError(reply, 400, "Search for your location again before saving.");
    const result = await prisma.$transaction(async tx => {
      await lockInvitationUsers(tx, [userId]);
      const profile = await tx.discoveryProfile.findUnique({ where: { ownerId: userId }, include: { distancePreference: true } });
      if (!await isDiscoveryAdmitted(tx, userId, profile) || !hasDiscoveryPublication(profile)) return denied;
      const stored = profile.distancePreference;
      if (!stored && !location) return { ok: false as const, status: 400, error: "Choose a search location first." };
      if (!location && stored?.maxDistanceMiles === maxDistanceMiles) return { ok: true as const, value: view(stored, !!geocode) };
      const quota = await consumeDiscoveryQuota(tx, userId, "locationChange");
      if (!quota.ok) return quota;
      const revision = randomUUID();
      const updated = location ? await tx.discoveryDistancePreference.upsert({
        where: { profileId: profile.id },
        create: { profileId: profile.id, ...location, maxDistanceMiles, revision },
        update: { ...location, maxDistanceMiles, revision },
      }) : await tx.discoveryDistancePreference.update({ where: { profileId: profile.id }, data: { maxDistanceMiles, revision } });
      return { ok: true as const, value: view(updated, !!geocode) };
    });
    return respondDiscovery(reply, userId, result);
  });
  server.delete(endpoint, async (request, reply) => {
    const context = await requireDiscoveryMutation(request, reply); if (!context) return;
    await prisma.$transaction(async tx => {
      await lockInvitationUsers(tx, [context.userId]);
      await tx.discoveryDistancePreference.deleteMany({ where: { profile: { ownerId: context.userId } } });
    });
    return { ownerId: context.userId, value: view(null, !!geocode) };
  });
}
