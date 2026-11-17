import { Prisma } from "../../../generated/prisma/client.js";

export const discoveryDistanceMiles = [5, 10, 25, 50] as const;
type Point = { latitude: number; longitude: number };
type Range = Point & { maxDistanceMiles: number };
const earthMiles = 3958.7613;
const radians = Math.PI / 180;

// Store a grid cell center, not a rooftop, even if the provider returned one.
export function approximateDiscoveryPoint(point: Point): Point {
  const roundToGrid = (n: number) => Math.round(n * 40) / 40;
  return { latitude: roundToGrid(point.latitude), longitude: roundToGrid(point.longitude) };
}

export function mutualDiscoveryDistance(left: Range | null, right: Range | null) {
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

export async function mutualDistanceProfileIds(tx: Prisma.TransactionClient, viewer: Range, pilotUserIds: string[]): Promise<string[]> {
  if (!pilotUserIds.length) return [];
  const delta = viewer.maxDistanceMiles / earthMiles / radians;
  // The indexed latitude strip cheaply bounds the search. Haversine handles
  // longitude wrap and enforces both limits before the ranking cohort is read.
  const matches = await tx.$queryRaw<{ profileId: string }[]>`SELECT d."profileId"
    FROM "DiscoveryDistancePreference" AS d
    JOIN "DiscoveryProfile" AS p ON p."id" = d."profileId"
    WHERE d."latitude" BETWEEN ${viewer.latitude - delta} AND ${viewer.latitude + delta}
      AND p."ownerId" IN (${Prisma.join(pilotUserIds)})
      AND power(sin(radians(d."latitude" - ${viewer.latitude}) / 2), 2)
        + cos(radians(${viewer.latitude}::double precision)) * cos(radians(d."latitude"))
          * power(sin(radians(d."longitude" - ${viewer.longitude}) / 2), 2)
        <= power(sin(least(d."maxDistanceMiles", ${viewer.maxDistanceMiles}::integer) / ${2 * earthMiles}::double precision), 2)`;
  return matches.map(row => row.profileId);
}
