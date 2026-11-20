import { Prisma, type DiscoveryMatchPreferences } from "../../../generated/prisma/client.js";
import { birthDateCutoff, calendarDate, completedAge, utcDate } from "./discovery-match-preferences.dates.js";
import { discoveryMatchPreferencesRequired } from "./discovery-match-preferences.service.js";

export function readDiscoveryMatchSettings(tx: Prisma.TransactionClient, ownerId: string) {
  return tx.discoveryMatchPreferences.findUnique({ where: { ownerId } });
}

function eligibility(viewer: DiscoveryMatchPreferences, today: string) {
  return {
    newestBirthDate: birthDateCutoff(today, viewer.minAge),
    oldestExclusive: viewer.maxAge === null ? null : birthDateCutoff(today, viewer.maxAge + 1),
    viewerAge: completedAge(utcDate(viewer.birthDate), today),
    viewerGender: viewer.gender,
    allowedGenders: viewer.meetGenders,
  };
}

export function mutualMatchWhere(viewer: DiscoveryMatchPreferences, today: string): Prisma.DiscoveryMatchPreferencesWhereInput {
  const rule = eligibility(viewer, today);
  return {
    gender: { in: rule.allowedGenders },
    birthDate: { lte: calendarDate(rule.newestBirthDate), ...(rule.oldestExclusive ? { gt: calendarDate(rule.oldestExclusive) } : {}) },
    meetGenders: { has: rule.viewerGender },
    minAge: { lte: rule.viewerAge },
    OR: [{ maxAge: null }, { maxAge: { gte: rule.viewerAge } }],
  };
}

export type DiscoveryMatchSearch = { viewer: DiscoveryMatchPreferences; today: string };

// Alias `p` is the DiscoveryProfile row in the distance query. No matching
// values are selected: this is a bound eligibility predicate before LIMIT.
export function distanceMutualMatchPredicate({ viewer, today }: DiscoveryMatchSearch) {
  const rule = eligibility(viewer, today);
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "DiscoveryMatchPreferences" match
    WHERE match."ownerId" = p."ownerId"
      AND match."gender" IN (${Prisma.join(rule.allowedGenders.map(gender => Prisma.sql`${gender}::"MatchGender"`))})
      AND match."birthDate" <= ${rule.newestBirthDate}::date
      ${rule.oldestExclusive ? Prisma.sql`AND match."birthDate" > ${rule.oldestExclusive}::date` : Prisma.empty}
      AND ${rule.viewerGender}::"MatchGender" = ANY(match."meetGenders")
      AND match."minAge" <= ${rule.viewerAge}
      AND (match."maxAge" IS NULL OR match."maxAge" >= ${rule.viewerAge})
  )`;
}

export async function requireMutualDiscoveryFit(tx: Prisma.TransactionClient, leftUserId: string, rightUserId: string, now: Date) {
  if (!discoveryMatchPreferencesRequired()) return true;
  const viewer = await readDiscoveryMatchSettings(tx, leftUserId);
  if (!viewer) return false;
  return !!await tx.discoveryMatchPreferences.findFirst({
    where: { ownerId: rightUserId, ...mutualMatchWhere(viewer, utcDate(now)) },
    select: { ownerId: true },
  });
}
