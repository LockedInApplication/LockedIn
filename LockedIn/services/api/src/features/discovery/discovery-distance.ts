import type { Prisma } from "../../../generated/prisma/client.js";

export const discoveryDistanceMiles = [5, 10, 25, 50] as const;
type Point = { latitude: number; longitude: number };
export type DiscoveryDistanceRange = Point & { maxDistanceMiles: number };
const earthMiles = 3958.7613;
const radians = Math.PI / 180;

// Store a grid cell center, not a rooftop, even if the provider returned one.
export function approximateDiscoveryPoint(point: Point): Point {
  const roundToGrid = (n: number) => Math.round(n * 40) / 40;
  return { latitude: roundToGrid(point.latitude), longitude: roundToGrid(point.longitude) };
}

export function mutualDiscoveryDistance(left: DiscoveryDistanceRange | null, right: DiscoveryDistanceRange | null) {
  if (!left || !right) return left === right; // Two city-only members can still discover each other.
  const halfLatitude = (right.latitude - left.latitude) * radians / 2;
  const halfLongitude = (right.longitude - left.longitude) * radians / 2;
  const haversine = Math.sin(halfLatitude) ** 2 + Math.cos(left.latitude * radians) * Math.cos(right.latitude * radians) * Math.sin(halfLongitude) ** 2;
  return haversine <= Math.sin(Math.min(left.maxDistanceMiles, right.maxDistanceMiles) / (2 * earthMiles)) ** 2;
}

export async function distancePairEligible(tx: Prisma.TransactionClient, leftId: string, rightId: string) {
  const rows = await tx.discoveryDistancePreference.findMany({ where: { profileId: { in: [leftId, rightId] } }, select: { profileId: true, latitude: true, longitude: true, maxDistanceMiles: true } });
  return mutualDiscoveryDistance(rows.find(row => row.profileId === leftId) ?? null, rows.find(row => row.profileId === rightId) ?? null);
}
