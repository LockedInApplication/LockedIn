import { Prisma } from "../../../generated/prisma/client.js";
import type { DiscoveryConfig } from "./discovery.types.js";
import type { DiscoveryDistanceRange } from "./discovery-distance.js";
import { compatibleIntentions } from "./discovery-matching.js";
import { distanceMutualMatchPredicate, type DiscoveryMatchSearch } from "./discovery-match-eligibility.js";

export const distanceSearchBatchSize = 32;

// Keep these eligibility predicates in parity with visibleWhere. The caller
// rechecks Prisma eligibility and validates snapshots before returning a card.
// Only this bounded ID batch crosses from PostgreSQL into application memory.
export function distanceCandidateQuery(actorId: string, viewer: DiscoveryDistanceRange, intention: string, config: DiscoveryConfig, before?: string, matching?: DiscoveryMatchSearch) {
  const earthMiles = 3958.7613;
  const delta = viewer.maxDistanceMiles / earthMiles * 180 / Math.PI;
  const intentions = compatibleIntentions(intention);
  const admission = !config.enabled || !config.admissionConfigured ? Prisma.sql`FALSE`
    : config.accessMode === "open" ? Prisma.sql`TRUE`
    : config.accessMode === "pilot" && config.pilotUserIds.length ? Prisma.sql`p."ownerId" IN (${Prisma.join(config.pilotUserIds)})` : Prisma.sql`FALSE`;
  return Prisma.sql`SELECT p."id" AS "profileId"
    FROM "DiscoveryDistancePreference" d
    JOIN "DiscoveryProfile" p ON p."id" = d."profileId"
    JOIN "user" u ON u."id" = p."ownerId"
    WHERE ${admission}
      ${matching ? Prisma.sql`AND ${distanceMutualMatchPredicate(matching)}` : Prisma.empty}
      AND p."ownerId" <> ${actorId} AND u."emailVerified" = TRUE
      AND p."pausedAt" IS NULL AND p."suspendedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "RelationshipMember" rm JOIN "Relationship" r ON r.id = rm."relationshipId"
        WHERE rm."userId" = p."ownerId" AND r."status" = 'ACTIVE' AND r."directLockedInAt" IS NOT NULL)
      AND p."adultAttestedAt" IS NOT NULL AND p."publicationConsentedAt" IS NOT NULL
      AND p."publicationConsentVersion" = 1 AND p."publicationVersion" > 0 AND p."publishedAt" IS NOT NULL
      AND ${config.areas.length ? Prisma.sql`p."publishedAreaId" IN (${Prisma.join(config.areas.map(area => area.id))})` : Prisma.sql`FALSE`}
      AND ${intentions.length ? Prisma.sql`p."publishedIntention" IN (${Prisma.join(intentions)})` : Prisma.sql`FALSE`}
      AND ${before ? Prisma.sql`p."id" < ${before}` : Prisma.sql`TRUE`}
      AND d."latitude" BETWEEN ${viewer.latitude - delta} AND ${viewer.latitude + delta}
      AND power(sin(radians(d."latitude" - ${viewer.latitude}) / 2), 2)
        + cos(radians(${viewer.latitude}::double precision)) * cos(radians(d."latitude"))
          * power(sin(radians(d."longitude" - ${viewer.longitude}) / 2), 2)
        <= power(sin(least(d."maxDistanceMiles", ${viewer.maxDistanceMiles}::integer) / ${2 * earthMiles}::double precision), 2)
      AND NOT EXISTS (SELECT 1 FROM "InvitationBlock" b WHERE b."blockerId" = ${actorId} AND b."blockedId" = p."ownerId")
      AND NOT EXISTS (SELECT 1 FROM "InvitationBlock" b WHERE b."blockedId" = ${actorId} AND b."blockerId" = p."ownerId")
      AND NOT EXISTS (
        SELECT 1 FROM "DiscoveryConnection" c
        LEFT JOIN "Relationship" r ON r."id" = c."relationshipId"
        WHERE ((c."userLowId" = ${actorId} AND c."userHighId" = p."ownerId")
          OR (c."userHighId" = ${actorId} AND c."userLowId" = p."ownerId"))
          AND (c."state" = 'ACCEPTED' OR (c."state" = 'PENDING' AND c."expiresAt" > ${new Date()})
            OR (c."state" = 'PROMOTED' AND r."status" = 'ACTIVE'))
      )
    ORDER BY p."id" DESC LIMIT ${distanceSearchBatchSize}`;
}

export async function distanceCandidateIds(tx: Prisma.TransactionClient, actorId: string, viewer: DiscoveryDistanceRange, intention: string, config: DiscoveryConfig, before?: string, matching?: DiscoveryMatchSearch) {
  const rows = await tx.$queryRaw<{ profileId: string }[]>(distanceCandidateQuery(actorId, viewer, intention, config, before, matching));
  return rows.map(row => row.profileId);
}
