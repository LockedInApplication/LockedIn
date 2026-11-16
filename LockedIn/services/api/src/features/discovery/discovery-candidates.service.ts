import { createHmac, timingSafeEqual } from "node:crypto";
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
type VisibleProfile = Omit<PublicDiscoveryProfile, "photoIds"> & { photos?: PhotoCard[] };

const denied = { ok: false as const, status: 403, error: "Discovery is not available for this account." };
const invalid = { ok: false as const, status: 400, error: "Please check your discovery search." };
const missing = { ok: false as const, status: 404, error: "This profile is not available." };
const cursorSchema = z.strictObject({ actor: z.string(), area: z.string(), intention: z.string(), id: z.string().uuid() });
function signature(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Discovery cursors require the configured authentication secret");
  return createHmac("sha256", secret).update(`discovery-cursor-v1:${payload}`).digest("base64url");
}
function encodeCursor(actor: string, area: string, intention: string, id: string) {
  const payload = Buffer.from(JSON.stringify({ actor, area, intention, id })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
function decodeCursor(value: string, actor: string, area: string, intention: string): string | null {
  if (value.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  const [payload, signed] = value.split(".") as [string, string];
  const expected = signature(payload);
  if (signed.length !== expected.length || !timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return parsed.success && parsed.data.actor === actor && parsed.data.area === area && parsed.data.intention === intention ? parsed.data.id : null;
  } catch { return null; }
}

// The database predicates exclude unsafe pairs before the page is selected.
export function visibleWhere(actorId: string, intention: string): Prisma.DiscoveryProfileWhereInput {
  const live: Prisma.DiscoveryConnectionWhereInput = { OR: [{ state: "ACCEPTED" }, { state: "PENDING", expiresAt: { gt: new Date() } }, { state: "PROMOTED", relationship: { status: "ACTIVE" } }] };
  return {
    ownerId: { not: actorId, in: getDiscoveryConfig().pilotUserIds }, pausedAt: null, suspendedAt: null,
    adultAttestedAt: { not: null }, publicationConsentedAt: { not: null }, publicationConsentVersion: 1,
    publishedAt: { not: null }, publicationVersion: { gt: 0 }, publishedIntention: intention,
    owner: { emailVerified: true,
      invitationBlocksCreated: { none: { blockedId: actorId } }, invitationBlocksReceived: { none: { blockerId: actorId } },
      discoveryConnectionsLow: { none: { userHighId: actorId, ...live } },
      discoveryConnectionsHigh: { none: { userLowId: actorId, ...live } },
    },
  };
}
const publicSelect = { id: true, publishedSnapshot: true, publishedAreaId: true, publishedIntention: true, adultAttestedAt: true, publicationConsentedAt: true, publicationConsentVersion: true, publishedAt: true, publicationVersion: true, pausedAt: true, suspendedAt: true } satisfies Prisma.DiscoveryProfileSelect;

export async function findVisibleDiscoveryProfile(tx: Prisma.TransactionClient, actorId: string, profileId: string) {
  const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
  if (!await isDiscoveryAdmitted(tx, actorId, actor) || !hasDiscoveryPublication(actor)) return null;
  const profile = await tx.discoveryProfile.findFirst({ where: { ...visibleWhere(actorId, actor.publishedIntention!), id: profileId, publishedAreaId: { in: getDiscoveryConfig().areas.map(area => area.id) } } });
  return hasDiscoveryPublication(profile) ? profile : null;
}

export async function listDiscoveryCandidates(actorId: string, areaId: string, cursor?: string): Promise<DiscoveryResult<{ items: VisibleProfile[]; nextCursor: string | null }>> {
  if (!configuredArea(areaId) || cursor === "") return invalid;
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [actorId]);
    const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
    if (!await isDiscoveryAdmitted(tx, actorId, actor) || !hasDiscoveryPublication(actor)) return denied;
    const intention = actor.publishedIntention!;
    const before = cursor === undefined ? undefined : decodeCursor(cursor, actorId, areaId, intention);
    if (before === null) return invalid;
    const quota = await consumeDiscoveryQuota(tx, actorId, "candidates"); if (!quota.ok) return quota;
    const items: PublicDiscoveryProfile[] = [];
    let scanBefore = before;
    while (items.length < 13) {
      const profiles = await tx.discoveryProfile.findMany({ where: { ...visibleWhere(actorId, intention), publishedAreaId: areaId, ...(scanBefore ? { id: { lt: scanBefore } } : {}) }, orderBy: { id: "desc" }, take: 32, select: publicSelect });
      if (!profiles.length) break;
      for (const profile of profiles) {
        if (!hasDiscoveryPublication(profile)) continue;
        const safe = publicDiscoveryProfile(profile.id, profile.publishedSnapshot);
        if (safe) items.push(safe);
        if (items.length === 13) break;
      }
      scanBefore = profiles.at(-1)!.id;
      if (profiles.length < 32) break;
    }
    const hasNext = items.length > 12;
    const page = items.slice(0, 12);
    return { ok: true, value: { items: await enrichPublishedPhotos(tx, page), nextCursor: hasNext ? encodeCursor(actorId, areaId, intention, page.at(-1)!.id) : null } };
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
    if (!hasDiscoveryPublication(profile)) return missing;
    const safe = publicDiscoveryProfile(profile.id, profile.publishedSnapshot);
    return safe ? { ok: true, value: (await enrichPublishedPhotos(tx, [safe]))[0]! } : missing;
  });
}
