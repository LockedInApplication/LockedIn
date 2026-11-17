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
import { distancePairEligible, mutualDistanceProfileIds } from "./discovery-distance.js";
type VisibleProfile = Omit<PublicDiscoveryProfile, "photoIds"> & { photos?: PhotoCard[]; recommendation?: ReturnType<typeof recommendation> };

const denied = { ok: false as const, status: 403, error: "Discovery is not available for this account." };
const invalid = { ok: false as const, status: 400, error: "Please check your discovery search." };
const missing = { ok: false as const, status: 404, error: "This profile is not available." };
const rankedLimit = 300;
const cursorSchema = z.strictObject({ scope: z.string(), day: z.number().int().nonnegative(), id: z.string().uuid(), rank: z.strictObject({ score: z.number().int().min(0).max(18), rotation: z.string().regex(/^[0-9a-f]{16}$/) }).optional() });
type CandidateCursor = z.infer<typeof cursorSchema>;
function discoverySecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Discovery cursors require the configured authentication secret");
  return secret;
}
const scopeFor = (actor: string, area: string, version: number) => createHmac("sha256", discoverySecret()).update(JSON.stringify(["discovery-scope", actor, area, version])).digest("base64url");
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
export function visibleWhere(actorId: string, intention: string): Prisma.DiscoveryProfileWhereInput {
  const live: Prisma.DiscoveryConnectionWhereInput = { OR: [{ state: "ACCEPTED" }, { state: "PENDING", expiresAt: { gt: new Date() } }, { state: "PROMOTED", relationship: { status: "ACTIVE" } }] };
  return {
    ownerId: { not: actorId, in: getDiscoveryConfig().pilotUserIds }, pausedAt: null, suspendedAt: null,
    adultAttestedAt: { not: null }, publicationConsentedAt: { not: null }, publicationConsentVersion: 1,
    publishedAt: { not: null }, publicationVersion: { gt: 0 }, publishedIntention: { in: compatibleIntentions(intention) },
    owner: { emailVerified: true,
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

export async function findVisibleDiscoveryProfile(tx: Prisma.TransactionClient, actorId: string, profileId: string) {
  const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
  if (!await isDiscoveryAdmitted(tx, actorId, actor) || !hasDiscoveryPublication(actor)) return null;
  const profile = await tx.discoveryProfile.findFirst({ where: { ...visibleWhere(actorId, actor.publishedIntention!), id: profileId, publishedAreaId: { in: getDiscoveryConfig().areas.map(area => area.id) } } });
  return hasDiscoveryPublication(profile) && await distancePairEligible(tx, actor.id, profile.id) ? profile : null;
}

export async function listDiscoveryCandidates(actorId: string, areaId: string | null, cursor?: string): Promise<DiscoveryResult<{ items: VisibleProfile[]; nextCursor: string | null }>> {
  if ((areaId !== null && !configuredArea(areaId)) || cursor === "") return invalid;
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [actorId]);
    const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId }, include: { distancePreference: true } });
    if (!await isDiscoveryAdmitted(tx, actorId, actor) || !hasDiscoveryPublication(actor)) return denied;
    const distance = actor.distancePreference;
    if (areaId === null ? !distance : !!distance) {
      return { ok: false, status: 409, error: "Your Discovery preferences changed. Refresh your search." };
    }
    const intention = actor.publishedIntention!;
    const today = Math.floor(Date.now() / dayMs);
    const scope = scopeFor(actorId, distance ? `distance:${distance.revision}` : `city:${areaId}`, actor.publicationVersion);
    const before = cursor === undefined ? undefined : decodeCursor(cursor, scope, today);
    if (before === null) return invalid;
    const quota = await consumeDiscoveryQuota(tx, actorId, "candidates"); if (!quota.ok) return quota;
    const activity = new Date(today * dayMs);
    if (!actor.lastDiscoveryActiveOn || actor.lastDiscoveryActiveOn < activity) {
      await tx.discoveryProfile.update({ where: { id: actor.id }, data: { lastDiscoveryActiveOn: activity, updatedAt: actor.updatedAt } });
    }
    const config = getDiscoveryConfig();
    const where: Prisma.DiscoveryProfileWhereInput = { ...visibleWhere(actorId, intention), ...(distance
      ? { id: { in: await mutualDistanceProfileIds(tx, distance, config.pilotUserIds) }, publishedAreaId: { in: config.areas.map(area => area.id) } }
      : { publishedAreaId: areaId, distancePreference: null }) };
    const day = before?.day ?? today;
    // Rank the whole eligible pilot cohort or fall back to ID keysets. Never
    // rank a truncated cohort that leaves the rest of the city undiscoverable.
    if (!before || before.rank) {
      const profiles = await tx.discoveryProfile.findMany({ where, take: rankedLimit + 1, select: { ...publicSelect, lastDiscoveryActiveOn: true } });
      if (profiles.length <= rankedLimit) {
        const viewer = publicDiscoveryProfile(actor.id, actor.publishedSnapshot)!;
        const anchor: DiscoveryRank | null = before?.rank ? { ...before.rank, id: before.id } : null;
        const secret = discoverySecret();
        const matches = profiles.flatMap(row => {
          const person = safeProfile(row);
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
    while (items.length < 13) {
      const profiles = await tx.discoveryProfile.findMany({ where: scanBefore ? { AND: [where, { id: { lt: scanBefore } }] } : where, orderBy: { id: "desc" }, take: 32, select: publicSelect });
      if (!profiles.length) break;
      for (const profile of profiles) {
        const safe = safeProfile(profile);
        if (safe) items.push(safe);
        if (items.length === 13) break;
      }
      scanBefore = profiles.at(-1)!.id;
      if (profiles.length < 32) break;
    }
    const hasNext = items.length > 12;
    const page = items.slice(0, 12);
    return { ok: true, value: { items: await enrichPublishedPhotos(tx, page), nextCursor: hasNext ? encodeCursor({ scope, day, id: page.at(-1)!.id }) : null } };
  });
}
export async function getVisibleDiscoveryProfile(actorId: string, profileId: string): Promise<DiscoveryResult<VisibleProfile>> {
  if (!discoveryProfileParams.safeParse({ profileId }).success) return invalid;
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [actorId]);
    const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
    if (!await isDiscoveryAdmitted(tx, actorId, actor) || !hasDiscoveryPublication(actor)) return denied;
    const quota = await consumeDiscoveryQuota(tx, actorId, "candidates"); if (!quota.ok) return quota;
    const profile = await tx.discoveryProfile.findFirst({ where: { ...visibleWhere(actorId, actor.publishedIntention!), id: profileId, publishedAreaId: { in: getDiscoveryConfig().areas.map(area => area.id) } }, select: publicSelect });
    const safe = safeProfile(profile);
    if (!safe || !await distancePairEligible(tx, actor.id, safe.id)) return missing;
    const viewer = publicDiscoveryProfile(actor.id, actor.publishedSnapshot)!;
    return { ok: true, value: { ...(await enrichPublishedPhotos(tx, [safe]))[0]!, recommendation: recommendation(viewer, safe) } };
  });
}
