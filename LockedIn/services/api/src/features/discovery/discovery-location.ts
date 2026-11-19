import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client.js";
import { getDiscoveryConfig } from "../../config/env.js";
import { distancePairEligible } from "./discovery-distance.js";

const point = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
export const deviceLocationSchema = point.extend({ accuracyMeters: z.number().min(0).max(5000) }).strict();
const catalog = z.array(point.extend({ areaId: z.string().min(1).max(100), radiusKm: z.number().min(1).max(100) }).strict()).min(1).max(100);

export const locationCheckMs = 24 * 60 * 60_000;
export const discoveryLocationRequired = () => process.env.DISCOVERY_LOCATION_REQUIRED === "true";
export const locationRequired = { ok: false as const, status: 403, error: "Confirm your current location before using local Discovery." };
export const noLocation = { required: true as const, areaId: null, expiresAt: null };

export function discoveryLocationMarkets() {
  const areas = new Set(getDiscoveryConfig().areas.map(area => area.id));
  try {
    const values = catalog.parse(JSON.parse(process.env.DISCOVERY_VERIFIED_MARKETS_JSON ?? "null"));
    if (new Set(values.map(item => item.areaId)).size === values.length && values.every(item => areas.has(item.areaId))) return values;
  } catch { return []; }
  return [];
}

export function marketForDevice(location: z.infer<typeof deviceLocationSchema>, markets: ReturnType<typeof discoveryLocationMarkets>) {
  const radians = Math.PI / 180;
  const eligible = markets.flatMap(market => {
    const halfLatitude = (market.latitude - location.latitude) * radians / 2;
    const halfLongitude = (market.longitude - location.longitude) * radians / 2;
    const haversine = Math.sin(halfLatitude) ** 2 + Math.cos(location.latitude * radians) * Math.cos(market.latitude * radians) * Math.sin(halfLongitude) ** 2;
    const distanceKm = 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, haversine)));
    return distanceKm + location.accuracyMeters / 1000 <= market.radiusKm ? [{ areaId: market.areaId, distanceKm }] : [];
  });
  return eligible.sort((left, right) => left.distanceKm - right.distanceKm || left.areaId.localeCompare(right.areaId))[0]?.areaId ?? null;
}

export async function currentDiscoveryLocation(db: Pick<Prisma.TransactionClient, "discoveryLocationCheck">, profileId: string, now = new Date()) {
  const check = await db.discoveryLocationCheck.findUnique({ where: { profileId } });
  return check && check.expiresAt > now && discoveryLocationMarkets().some(market => market.areaId === check.areaId) ? check : null;
}

export async function discoverySearchPairEligible(tx: Prisma.TransactionClient, leftId: string, rightId: string) {
  if (!discoveryLocationRequired()) return distancePairEligible(tx, leftId, rightId);
  const now = new Date();
  const checks = await tx.discoveryLocationCheck.findMany({ where: { profileId: { in: [leftId, rightId] }, expiresAt: { gt: now } } });
  return checks.length === 2 && checks[0]!.areaId === checks[1]!.areaId && discoveryLocationMarkets().some(market => market.areaId === checks[0]!.areaId);
}
