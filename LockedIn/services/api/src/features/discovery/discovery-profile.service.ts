import { prisma } from "../../lib/prisma.js";
import { getDiscoveryConfig } from "../../config/env.js";
import type { DiscoveryProfile, Prisma } from "../../../generated/prisma/client.js";
import { lockInvitationUsers } from "../invitations/invitation-access.service.js";
import { configuredArea, discoveryProfileSchema } from "./discovery.schemas.js";
import { discoveryDraft, ownDiscoveryProfile, publicDiscoveryProfile } from "./discovery-profile.view.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";
import type { DiscoveryProfileInput, DiscoveryResult } from "./discovery.types.js";

export async function isDiscoveryAdmitted(tx: Prisma.TransactionClient, actorId: string, profile: DiscoveryProfile | null) {
  const config = getDiscoveryConfig();
  if (!config.enabled || !config.admissionConfigured || !config.pilotUserIds.includes(actorId) || profile?.suspendedAt) return false;
  return !!(await tx.user.findUnique({ where: { id: actorId }, select: { emailVerified: true } }))?.emailVerified;
}
export type DiscoveryPublication = Pick<DiscoveryProfile, "id" | "pausedAt" | "suspendedAt" | "adultAttestedAt" | "publicationConsentedAt" | "publicationConsentVersion" | "publishedAt" | "publicationVersion" | "publishedSnapshot" | "publishedAreaId" | "publishedIntention">;
export function hasDiscoveryPublication<T extends DiscoveryPublication>(profile: T | null): profile is T {
  if (!profile || profile.pausedAt || profile.suspendedAt || !profile.adultAttestedAt || !profile.publicationConsentedAt || profile.publicationConsentVersion !== 1 || !profile.publishedAt || profile.publicationVersion < 1) return false;
  const safe = publicDiscoveryProfile(profile.id, profile.publishedSnapshot);
  return !!safe && configuredArea(safe.areaId) && safe.areaId === profile.publishedAreaId && safe.intention === profile.publishedIntention;
}
export async function getOwnDiscoveryProfile(actorId: string) {
  return { ok: true as const, value: ownDiscoveryProfile(await prisma.discoveryProfile.findUnique({ where: { ownerId: actorId } })) };
}
const denied = { ok: false as const, status: 403, error: "Discovery is not available for this account." };
const invalid = { ok: false as const, status: 400, error: "Please check your discovery profile." };
const stale = { ok: false as const, status: 409, error: "Your draft changed. Reload before publishing or saving." };
type ProfileResult = DiscoveryResult<ReturnType<typeof ownDiscoveryProfile>>;

export async function saveDiscoveryProfileDraft(actorId: string, input: DiscoveryProfileInput, revision: number): Promise<ProfileResult> {
  const parsed = discoveryProfileSchema.safeParse(input);
  if (!parsed.success || !configuredArea(parsed.data.areaId) || !Number.isSafeInteger(revision) || revision < 0) return invalid;
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [actorId]);
    const existing = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
    if (!await isDiscoveryAdmitted(tx, actorId, existing)) return denied;
    if (discoveryDraft(existing).revision !== revision) return stale;
    const quota = await consumeDiscoveryQuota(tx, actorId, "profile"); if (!quota.ok) return quota;
    const draft = { revision: revision + 1, profile: parsed.data };
    const profile = await tx.discoveryProfile.upsert({ where: { ownerId: actorId }, create: { ownerId: actorId, draft }, update: { draft } });
    return { ok: true, value: ownDiscoveryProfile(profile) };
  });
}
export async function publishDiscoveryProfile(actorId: string, draftRevision: number, adultAttested: true): Promise<ProfileResult> {
  if (adultAttested !== true || !Number.isSafeInteger(draftRevision) || draftRevision < 1) return invalid;
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [actorId]);
    const existing = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
    if (!await isDiscoveryAdmitted(tx, actorId, existing)) return denied;
    const draft = discoveryDraft(existing);
    if (!existing || draft.revision !== draftRevision) return stale;
    if (!draft.profile || !configuredArea(draft.profile.areaId)) return invalid;
    const quota = await consumeDiscoveryQuota(tx, actorId, "profile"); if (!quota.ok) return quota;
    const now = new Date();
    const profile = await tx.discoveryProfile.update({ where: { id: existing.id }, data: { publishedSnapshot: draft.profile, publishedAreaId: draft.profile.areaId, publishedIntention: draft.profile.intention, publicationVersion: { increment: 1 }, publicationConsentVersion: 1, publicationConsentedAt: now, adultAttestedAt: existing.adultAttestedAt ?? now, publishedAt: now } });
    return { ok: true, value: ownDiscoveryProfile(profile) };
  });
}
export async function setDiscoveryPaused(actorId: string, paused: boolean): Promise<ProfileResult> {
  if (typeof paused !== "boolean") return invalid;
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [actorId]);
    const existing = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
    if (!paused && !await isDiscoveryAdmitted(tx, actorId, existing)) return denied;
    const quota = await consumeDiscoveryQuota(tx, actorId, "mutation"); if (!quota.ok) return quota;
    const profile = await tx.discoveryProfile.upsert({ where: { ownerId: actorId }, create: { ownerId: actorId, draft: { revision: 0 }, pausedAt: paused ? new Date() : null }, update: { pausedAt: paused ? new Date() : null } });
    return { ok: true, value: ownDiscoveryProfile(profile) };
  });
}
