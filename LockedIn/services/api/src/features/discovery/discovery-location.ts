import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client.js";
import { getDiscoveryConfig } from "../../config/env.js";
import { distancePairEligible } from "./discovery-distance.js";
import { readDiscoveryLocationPolicy, type DiscoveryLocationPolicy } from "./discovery.config.js";
import { discoveryDistanceKm, isWorldwideCell, nearbyCells } from "./discovery-global-grid.js";
export { cellForDevice, nearbyCells } from "./discovery-global-grid.js";

const point = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
export const deviceLocationSchema = point.extend({ accuracyMeters: z.number().min(0).max(5000) }).strict();
const catalog = z.array(point.extend({ areaId: z.string().min(1).max(100), radiusKm: z.number().min(1).max(100) }).strict()).min(1).max(100);

export const locationCheckMs = 24 * 60 * 60_000;
export const discoveryLocationPolicy = () => readDiscoveryLocationPolicy(process.env);
export const discoveryLocationRequired = () => discoveryLocationPolicy().mode !== "legacy";
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
  const eligible = markets.flatMap(market => {
    const distanceKm = discoveryDistanceKm(location, market);
    return distanceKm + location.accuracyMeters / 1000 <= market.radiusKm ? [{ areaId: market.areaId, distanceKm }] : [];
  });
  return eligible.sort((left, right) => left.distanceKm - right.distanceKm || left.areaId.localeCompare(right.areaId))[0]?.areaId ?? null;
}

type ActivePolicy = Extract<DiscoveryLocationPolicy, { mode: "metro" | "worldwide" }>;
type StoredCheck = { areaId: string; expiresAt: Date };
export type CurrentCheck = StoredCheck & { storageId: string };

export function locationStorageId(policy: ActivePolicy, areaId: string) {
  return policy.generation === null ? areaId : `v1:${policy.mode}:${policy.generation}:${areaId}`;
}

function locationFromStorage(policy: DiscoveryLocationPolicy, check: StoredCheck | null, now: Date): CurrentCheck | null {
  if (!check || check.expiresAt <= now || (policy.mode !== "metro" && policy.mode !== "worldwide")) return null;
  const prefix = locationStorageId(policy, "");
  if (!check.areaId.startsWith(prefix)) return null;
  const areaId = check.areaId.slice(prefix.length);
  if (policy.mode === "worldwide" ? !isWorldwideCell(areaId) : !discoveryLocationMarkets().some(market => market.areaId === areaId)) return null;
  return { areaId, storageId: check.areaId, expiresAt: check.expiresAt };
}

export function publicDiscoveryLocation(policy: DiscoveryLocationPolicy, check: StoredCheck | null) {
  if (policy.mode === "worldwide") {
    return { required: true as const, mode: "worldwide" as const, areaId: null, expiresAt: check?.expiresAt.toISOString() ?? null };
  }
  return check ? { required: true as const, areaId: check.areaId, expiresAt: check.expiresAt.toISOString() } : noLocation;
}

export async function currentDiscoveryLocation(db: Pick<Prisma.TransactionClient, "discoveryLocationCheck">, profileId: string, now = new Date(), policy = discoveryLocationPolicy()) {
  const check = await db.discoveryLocationCheck.findUnique({ where: { profileId } });
  return locationFromStorage(policy, check, now);
}

export async function discoverySearchPairEligible(tx: Prisma.TransactionClient, leftId: string, rightId: string) {
  const policy = discoveryLocationPolicy();
  if (policy.mode === "legacy") return distancePairEligible(tx, leftId, rightId);
  if (policy.mode === "unavailable") return false;
  const now = new Date();
  const checks = await tx.discoveryLocationCheck.findMany({ where: { profileId: { in: [leftId, rightId] }, expiresAt: { gt: now } } });
  if (checks.length !== 2) return false;
  const left = locationFromStorage(policy, checks[0]!, now), right = locationFromStorage(policy, checks[1]!, now);
  if (!left || !right) return false;
  return policy.mode === "worldwide" ? nearbyCells(left.areaId).includes(right.areaId) : left.areaId === right.areaId;
}
