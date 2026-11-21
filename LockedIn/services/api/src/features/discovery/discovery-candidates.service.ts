import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { getDiscoveryConfig } from "../../config/env.js";
import { lockInvitationUsers } from "../invitations/invitation-access.service.js";
import { configuredArea, discoveryProfileParams } from "./discovery.schemas.js";
import { hasDiscoveryPublication, isDiscoveryAdmitted } from "./discovery-profile.service.js";
import { publicDiscoveryProfile } from "./discovery-profile.view.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";
import type { DiscoveryResult, PublicDiscoveryProfile } from "./discovery.types.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { enrichPublishedPhotos } from "./photos/photo-cards.service.js";
import type { PhotoCard } from "./photos/photo.types.js";
import { compareDiscoveryRank, compatibleIntentions, dayMs, rankCandidate, recommendation, type DiscoveryRank } from "./discovery-matching.js";
import { currentDiscoveryLocation, discoveryLocationPolicy, discoveryLocationRequired, discoverySearchPairEligible, locationRequired, locationStorageId, nearbyCells } from "./discovery-location.js";
import { worldwidePublicArea } from "./discovery.config.js";
import { distanceCandidateIds, distanceSearchBatchSize } from "./discovery-distance-search.js";
import { activeLockIn, isDiscoveryLockedIn } from './discovery-lock-in.js';
import { mutualMatchWhere, readDiscoveryMatchSettings } from "./discovery-match-eligibility.js";
import { discoveryMatchPreferencesRequired } from "./discovery-match-preferences.service.js";
import { utcDate } from "./discovery-match-preferences.dates.js";
type VisibleProfile = Omit<PublicDiscoveryProfile, "photoIds"> & { photos?: PhotoCard[]; recommendation?: ReturnType<typeof recommendation> };

const denied = { ok: false as const, status: 403, error: "Discovery is not available for this account." };
const invalid = { ok: false as const, status: 400, error: "Please check your discovery search." };
const missing = { ok: false as const, status: 404, error: "This profile is not available." };
const setupRequired = { ok: false as const, status: 403, error: "Complete your private matching setup before using Discovery." };
const rankedLimit = 300;
const cursorSchema = z.strictObject({ scope: z.string(), day: z.number().int().nonnegative(), id: z.string().uuid(), rank: z.strictObject({ score: z.number().int().min(0).max(18), rotation: z.string().regex(/^[0-9a-f]{16}$/) }).optional() });
type CandidateCursor = z.infer<typeof cursorSchema>;
function discoverySecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Discovery cursors require the configured authentication secret");
  return secret;
}
const scopeFor = (actor: string, area: string, version: number, matchingRevision: string | null) => {
  const config = getDiscoveryConfig();
  return createHmac("sha256", discoverySecret()).update(JSON.stringify([
    "discovery-scope-v3", actor, area, version, config.accessMode,
    config.accessMode === "pilot" ? [...config.pilotUserIds].sort() : [],
    config.areas.map(item => item.id).sort(), matchingRevision,
  ])).digest("base64url");
};
const cursorKey = () => createHmac("sha256", discoverySecret()).update("discovery-cursor-v2").digest();
function encodeCursor(cursor: CandidateCursor) {
  // The anchor includes a score influenced by private coarse activity.
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cursorKey(), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(cursor)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString("base64url");
}
function decodeCursor(value: string, scope: string, day: number): CandidateCursor | null {
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length <= 28 || bytes.toString("base64url") !== value) return null;
    const decipher = createDecipheriv("aes-256-gcm", cursorKey(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const payload = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = cursorSchema.safeParse(JSON.parse(payload));
    return parsed.success && parsed.data.scope === scope && parsed.data.day === day ? parsed.data : null;
  } catch { return null; }
}

// The database predicates exclude unsafe pairs before the page is selected.
export function visibleWhere(actorId: string, intention: string, matching?: Prisma.DiscoveryMatchPreferencesWhereInput): Prisma.DiscoveryProfileWhereInput {
  const config = getDiscoveryConfig();
  const live: Prisma.DiscoveryConnectionWhereInput = { OR: [{ state: "ACCEPTED" }, { state: "PENDING", expiresAt: { gt: new Date() } }, { state: "PROMOTED", relationship: { status: "ACTIVE" } }] };
  return {
    ownerId: { not: actorId, ...(config.accessMode === "open" ? {} : { in: config.pilotUserIds }) }, pausedAt: null, suspendedAt: null,
    adultAttestedAt: { not: null }, publicationConsentedAt: { not: null }, publicationConsentVersion: 1,
    publishedAt: { not: null }, publicationVersion: { gt: 0 }, publishedIntention: { in: compatibleIntentions(intention) },
    owner: { emailVerified: true,
      ...(matching ? { discoveryMatchPreferences: { is: matching } } : {}),
      AND: [{ discoveryConnectionsLow: { none: activeLockIn } }, { discoveryConnectionsHigh: { none: activeLockIn } }],
      invitationBlocksCreated: { none: { blockedId: actorId } }, invitationBlocksReceived: { none: { blockerId: actorId } },
      discoveryConnectionsLow: { none: { userHighId: actorId, ...live } },
      discoveryConnectionsHigh: { none: { userLowId: actorId, ...live } },
    },
  };
}
const publicSelect = { id: true, publishedSnapshot: true, publishedAreaId: true, publishedIntention: true, adultAttestedAt: true, publicationConsentedAt: true, publicationConsentVersion: true, publishedAt: true, publicationVersion: true, pausedAt: true, suspendedAt: true } satisfies Prisma.DiscoveryProfileSelect;
function safeProfile(row: Parameters<typeof hasDiscoveryPublication>[0]) {
  return hasDiscoveryPublication(row) ? publicDiscoveryProfile(row.id, row.publishedSnapshot) : null;
}

export async function findVisibleDiscoveryProfile(tx: Prisma.TransactionClient, actorId: string, profileId: string, purpose: "browse" | "safety-report" = "browse") {
  const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
  if (!await isDiscoveryAdmitted(tx, actorId, actor) || !hasDiscoveryPublication(actor) || await isDiscoveryLockedIn(tx, actorId)) return null;
  const matching = purpose === "browse" && discoveryMatchPreferencesRequired();
  const settings = matching ? await readDiscoveryMatchSettings(tx, actorId) : null;
  if (matching && !settings) return null;
  const profile = await tx.discoveryProfile.findFirst({ where: { ...visibleWhere(actorId, actor.publishedIntention!, settings ? mutualMatchWhere(settings, utcDate(new Date())) : undefined), id: profileId, ...catalogPublicationFilter() } });
  return hasDiscoveryPublication(profile) && await discoverySearchPairEligible(tx, actor.id, profile.id) ? profile : null;
}

function catalogPublicationFilter(): Prisma.DiscoveryProfileWhereInput {
  return discoveryLocationPolicy().mode === "worldwide" ? {} : { publishedAreaId: { in: getDiscoveryConfig().areas.map(area => area.id) } };
}

type CandidateSearch = { mode: "nearby" | "distance" } | { mode: "city"; areaId: string };
export async function listDiscoveryCandidates(actorId: string, search: CandidateSearch, cursor?: string): Promise<DiscoveryResult<{ items: VisibleProfile[]; nextCursor: string | null }>> {
  const areaId = search.mode === "city" ? search.areaId : null;
  const policy = discoveryLocationPolicy();
  if ((areaId !== null && !configuredArea(areaId)) || cursor === "") return invalid;
  if (policy.mode === "worldwide" ? search.mode !== "nearby" : search.mode === "nearby") return locationRequired;
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [actorId]);
    const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId }, include: { distancePreference: true } });
    if (!await isDiscoveryAdmitted(tx, actorId, actor) || !hasDiscoveryPublication(actor) || await isDiscoveryLockedIn(tx, actorId)) return denied;
    const now = new Date();
    const matchingRequired = discoveryMatchPreferencesRequired();
    const settings = matchingRequired ? await readDiscoveryMatchSettings(tx, actorId) : null;
    if (matchingRequired && !settings) return setupRequired;
    const matching = settings ? { viewer: settings, today: utcDate(now) } : undefined;
    const gate = policy.mode !== "legacy";
    const worldwide = policy.mode === "worldwide";
    const location = gate ? await currentDiscoveryLocation(tx, actor.id, now, policy) : null;
    if (gate && (!location || (!worldwide && areaId !== location.areaId))) return locationRequired;
    if (policy.mode === "metro" && !configuredArea(actor.publishedAreaId ?? "")) return setupRequired;
    const distance = gate ? null : actor.distancePreference;
    if (!gate && (areaId === null ? !distance : !!distance)) {
      return { ok: false, status: 409, error: "Your Discovery preferences changed. Refresh your search." };
    }
    const intention = actor.publishedIntention!;
    const today = Math.floor(now.getTime() / dayMs);
    const scope = scopeFor(actorId, location ? `local:${location.storageId}:${location.expiresAt.toISOString()}` : distance ? `distance:${distance.revision}` : `city:${areaId}`, actor.publicationVersion, settings?.revision ?? null);
    const before = cursor === undefined ? undefined : decodeCursor(cursor, scope, today);
    if (before === null) return invalid;
    const quota = await consumeDiscoveryQuota(tx, actorId, "candidates"); if (!quota.ok) return quota;
    const activity = new Date(today * dayMs);
    if (!actor.lastDiscoveryActiveOn || actor.lastDiscoveryActiveOn < activity) {
      await tx.discoveryProfile.update({ where: { id: actor.id }, data: { lastDiscoveryActiveOn: activity, updatedAt: actor.updatedAt } });
    }
    const config = getDiscoveryConfig();
    const where: Prisma.DiscoveryProfileWhereInput = { ...visibleWhere(actorId, intention, matching ? mutualMatchWhere(matching.viewer, matching.today) : undefined), ...(location
      ? { locationCheck: { is: { areaId: policy.mode === "worldwide"
          ? { in: nearbyCells(location.areaId).map(cell => locationStorageId(policy, cell)) }
          : location.storageId, expiresAt: { gt: now } } }, ...catalogPublicationFilter() }
      : distance
      ? { publishedAreaId: { in: config.areas.map(area => area.id) } }
      : { publishedAreaId: areaId, distancePreference: null }) };
    const visible = (row: Parameters<typeof safeProfile>[0]) => {
      const person = safeProfile(row);
      return person && location ? { ...person, areaId: worldwide ? worldwidePublicArea : location.areaId } : person;
    };
    const day = before?.day ?? today;
    // Rank the whole eligible pilot cohort or fall back to ID keysets. Never
    // rank a truncated cohort that leaves the rest of the city undiscoverable.
    if (!worldwide && !distance && (!before || before.rank)) {
      const profiles = await tx.discoveryProfile.findMany({ where, take: rankedLimit + 1, select: { ...publicSelect, lastDiscoveryActiveOn: true } });
      if (profiles.length <= rankedLimit) {
        const viewer = visible(actor)!;
        const anchor: DiscoveryRank | null = before?.rank ? { ...before.rank, id: before.id } : null;
        const secret = discoverySecret();
        const matches = profiles.flatMap(row => {
          const person = visible(row);
          if (!person) return [];
          const rank = rankCandidate(viewer, person, row.lastDiscoveryActiveOn, day, secret);
          return anchor && compareDiscoveryRank(rank, anchor) <= 0 ? [] : [{ person, rank }];
        }).sort((a, b) => compareDiscoveryRank(a.rank, b.rank));
        const page = matches.slice(0, 12);
        const last = page.at(-1)?.rank;
        return { ok: true, value: { items: await enrichPublishedPhotos(tx, page.map(match => match.person)), nextCursor: matches.length > 12 && last ? encodeCursor({ scope, day, id: last.id, rank: { score: last.score, rotation: last.rotation } }) : null } };
      }
      if (before?.rank) return invalid;
    }

    const items: PublicDiscoveryProfile[] = [];
    let scanBefore = before?.id;
    let batches = 0, exhausted = false;
    // Bound snapshot-validation work as well as SQL result size. An empty or
    // partial page can carry a continuation after a run of corrupt snapshots.
    const bounded = !!distance || worldwide;
    while (items.length < 13 && (!bounded || batches < 8)) {
      batches++;
      const ids = distance ? await distanceCandidateIds(tx, actorId, distance, intention, config, scanBefore, matching) : null;
      if (ids && !ids.length) { exhausted = true; break; }
      const profiles = await tx.discoveryProfile.findMany({ where: ids ? { AND: [where, { id: { in: ids } }] } : scanBefore ? { AND: [where, { id: { lt: scanBefore } }] } : where, orderBy: { id: "desc" }, take: distanceSearchBatchSize, select: publicSelect });
      if (!ids && !profiles.length) { exhausted = true; break; }
      for (const profile of profiles) {
        const safe = visible(profile);
        if (safe) items.push(safe);
        if (items.length === 13) break;
      }
      // Advance using the SQL batch even if concurrent safety changes filtered
      // every hydrated record. An unsafe snapshot never ends the search early.
      scanBefore = ids?.at(-1) ?? profiles.at(-1)!.id;
      if ((ids?.length ?? profiles.length) < distanceSearchBatchSize) { exhausted = true; break; }
    }
    const hasNext = items.length > 12 || (bounded && batches === 8 && !exhausted);
    const page = items.slice(0, 12);
    const anchor = items.length > 12 ? page.at(-1)!.id : scanBefore;
    return { ok: true, value: { items: await enrichPublishedPhotos(tx, page), nextCursor: hasNext && anchor ? encodeCursor({ scope, day, id: anchor }) : null } };
  });
}
export async function getVisibleDiscoveryProfile(actorId: string, profileId: string): Promise<DiscoveryResult<VisibleProfile>> {
  if (!discoveryProfileParams.safeParse({ profileId }).success) return invalid;
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [actorId]);
    const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
    const matchingRequired = discoveryMatchPreferencesRequired();
    if (!await isDiscoveryAdmitted(tx, actorId, actor) || !hasDiscoveryPublication(actor) || ((matchingRequired || discoveryLocationRequired()) && await isDiscoveryLockedIn(tx, actorId))) return denied;
    const now = new Date();
    const settings = matchingRequired ? await readDiscoveryMatchSettings(tx, actorId) : null;
    if (matchingRequired && !settings) return missing;
    const gate = discoveryLocationRequired();
    const location = gate ? await currentDiscoveryLocation(tx, actor.id) : null;
    if (gate && !location) return locationRequired;
    const quota = await consumeDiscoveryQuota(tx, actorId, "candidates"); if (!quota.ok) return quota;
    const profile = await tx.discoveryProfile.findFirst({ where: { ...visibleWhere(actorId, actor.publishedIntention!, settings ? mutualMatchWhere(settings, utcDate(now)) : undefined), id: profileId, ...catalogPublicationFilter() }, select: publicSelect });
    const safe = safeProfile(profile);
    if (!safe || !await discoverySearchPairEligible(tx, actor.id, safe.id)) return missing;
    const viewer = publicDiscoveryProfile(actor.id, actor.publishedSnapshot)!;
    const visible = location ? { ...safe, areaId: discoveryLocationPolicy().mode === "worldwide" ? worldwidePublicArea : location.areaId } : safe;
    return { ok: true, value: { ...(await enrichPublishedPhotos(tx, [visible]))[0]!, recommendation: recommendation(location ? { ...viewer, areaId: visible.areaId } : viewer, visible) } };
  });
}
