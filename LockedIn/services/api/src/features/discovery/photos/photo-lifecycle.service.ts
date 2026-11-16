import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../../lib/prisma.js";
import type { DiscoveryPhoto, Prisma } from "../../../../generated/prisma/client.js";
import { lockInvitationUsers } from "../../invitations/invitation-access.service.js";
import { isDiscoveryAdmitted } from "../discovery-profile.service.js";
import { discoveryDraft, ownDiscoveryProfile, publicDiscoveryProfile } from "../discovery-profile.view.js";
import { consumeDiscoveryQuota } from "../discovery-throttle.service.js";
import { photoPublicId } from "./photo-cloudinary.js";
import { getPhotoConfig } from "./photo.config.js";
import { normalizePhoto } from "./photo-image.js";
import { classifyPhoto } from "./photo-policy.js";
import { draftPhotoIds, publishedPhotoIds, queuePhotoDestroy, revokeRemovedPhotos } from "./photo-profile.service.js";
import type { OwnPhoto, PhotoProvider, PhotoResult } from "./photo.types.js";

type Profile = ReturnType<typeof ownDiscoveryProfile>;
type UploadResult = { photoId: string; profile: Profile };
type Fields = { requestId: string; draftRevision: number; replacePhotoId?: string | undefined };
const stale = { ok: false as const, status: 409, error: "Your photo or draft changed. Reload before trying again." };
const denied = { ok: false as const, status: 403, error: "Photo uploads are not available for this account." };
const missing = { ok: false as const, status: 404, error: "Photo not found." };
const ok = <T>(value: T) => ({ ok: true as const, value });
const uploadsEnabled = () => { const config = getPhotoConfig(); return config.enabled && config.configured; };
const idle = 60_000;
const jobKey = (id: string) => `reconcile:${id}`;

export function ownPhoto(row: DiscoveryPhoto): OwnPhoto {
  return { id: row.id, state: row.state, reason: row.reason, decisionRevision: row.decisionRevision, canAppeal: row.state === "REJECTED" && row.scanCompleted && !row.destroyedAt && row.appealedRevision !== row.decisionRevision, width: row.width, height: row.height, ...(row.assetId && row.state !== "REJECTED" && !row.revokedAt && !row.deletedAt ? { src: `/api/discovery/photos/${row.id}/media` } : {}) };
}

export async function listOwnPhotos(ownerId: string) {
  const profile = await prisma.discoveryProfile.findUnique({ where: { ownerId } });
  const draftIds = profile ? draftPhotoIds(profile) : [];
  const publishedIds = profile ? publishedPhotoIds(profile) : [];
  const order = [...new Set([...draftIds, ...publishedIds])];
  const rows = await prisma.discoveryPhoto.findMany({ where: { ownerId, id: { in: order }, deletedAt: null, revokedAt: null } });
  const byId = new Map(rows.map(row => [row.id, row]));
  return ok({ items: order.flatMap(id => { const row = byId.get(id); return row ? [ownPhoto(row)] : []; }), draftIds, publishedIds });
}

async function completeJob(tx: Prisma.TransactionClient, id: string) {
  await tx.discoveryPhotoJob.updateMany({ where: { dedupeKey: jobKey(id), completedAt: null }, data: { completedAt: new Date(), leaseToken: null, leaseUntil: null } });
}

export async function finalizePhotoUpload(ownerId: string, id: string, result: Awaited<ReturnType<PhotoProvider["upload"]>> | null, lease?: { id: string; token: string; clock: () => Date }): Promise<PhotoResult<UploadResult>> {
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [ownerId]);
    if (lease) {
      const claimed = await tx.discoveryPhotoJob.updateMany({ where: { id: lease.id, photoId: id, kind: "RECONCILE", leaseToken: lease.token, leaseUntil: { gt: lease.clock() }, completedAt: null }, data: { leaseToken: lease.token } });
      if (!claimed.count) return stale;
    }
    const row = await tx.discoveryPhoto.findFirst({ where: { id, ownerId } });
    const profile = await tx.discoveryProfile.findUnique({ where: { ownerId } });
    if (!row || !profile) return missing;
    const draft = discoveryDraft(profile);
    const ids = draft.profile?.photoIds ?? [];
    const attached = ids.includes(id);
    const admitted = uploadsEnabled() && await isDiscoveryAdmitted(tx, ownerId, profile);
    const slotAvailable = row.replacePhotoId ? ids.includes(row.replacePhotoId) : ids.length < 3;
    if (attached && !admitted && !row.deletedAt && !row.revokedAt) return denied;
    if (row.deletedAt || row.revokedAt || !admitted || (!attached && (!draft.profile || draft.revision !== row.expectedRevision || !slotAvailable))) {
      if (!row.revokedAt) await tx.discoveryPhoto.update({ where: { id }, data: { revokedAt: new Date(), decisionRevision: { increment: 1 } } });
      await queuePhotoDestroy(tx, id, new Date(Date.now() + idle));
      await completeJob(tx, id);
      return admitted ? stale : denied;
    }
    // Reconciliation never rewrites an immutable asset or an already completed decision.
    if (row.scanCompleted) return ok({ photoId: id, profile: ownDiscoveryProfile(profile) });
    const validResult = result && result.asset.publicId === row.publicId && (!row.assetId || (row.assetId === result.asset.assetId && row.assetVersion === result.asset.version)) ? result : null;
    const decision = classifyPhoto(validResult?.screening);
    await tx.discoveryPhoto.update({ where: { id }, data: {
      state: decision.state, reason: decision.reason, policyVersion: decision.policyVersion, scanCompleted: decision.complete, screening: decision.labels,
      decisionRevision: { increment: 1 },
      ...(validResult ? { assetId: validResult.asset.assetId, assetVersion: validResult.asset.version } : {}),
    } });
    if (decision.complete) await completeJob(tx, id);
    else await tx.discoveryPhotoJob.updateMany({ where: { dedupeKey: jobKey(id), completedAt: null }, data: { dueAt: new Date(Date.now() + idle) } });
    let updated = profile;
    if (!attached && draft.profile) {
      const photoIds = row.replacePhotoId ? ids.map(value => value === row.replacePhotoId ? id : value) : [...ids, id];
      updated = await tx.discoveryProfile.update({ where: { id: profile.id }, data: { draft: { revision: draft.revision + 1, profile: { ...draft.profile, photoIds } } } });
      await revokeRemovedPhotos(tx, updated, ids);
    }
    return ok({ photoId: id, profile: ownDiscoveryProfile(updated) });
  });
}

export async function uploadPhoto(ownerId: string, fields: Fields, bytes: Buffer, mime: string, provider: PhotoProvider): Promise<PhotoResult<UploadResult>> {
  const hash = createHash("sha256").update(JSON.stringify([fields.draftRevision, fields.replacePhotoId ?? null, mime])).update(bytes).digest("hex");
  const inspect = async (tx: Prisma.TransactionClient) => {
    const row = await tx.discoveryPhoto.findUnique({ where: { ownerId_requestId: { ownerId, requestId: fields.requestId } } });
    const profile = await tx.discoveryProfile.findUnique({ where: { ownerId } });
    if (row) return { result: row.payloadHash !== hash || row.revokedAt || row.deletedAt ? stale : ok({ photoId: row.id, profile: ownDiscoveryProfile(profile) }) };
    if (!uploadsEnabled() || !await isDiscoveryAdmitted(tx, ownerId, profile)) return { result: denied };
    const draft = discoveryDraft(profile);
    const ids = draft.profile?.photoIds ?? [];
    if (!profile || !draft.profile || draft.revision !== fields.draftRevision || (fields.replacePhotoId ? !ids.includes(fields.replacePhotoId) : ids.length >= 3)) return { result: stale };
    const inFlight = await tx.discoveryPhoto.findFirst({ where: { ownerId, deletedAt: null, revokedAt: null, state: "PROCESSING", id: { notIn: ids }, assetId: null } });
    return inFlight ? { result: stale } : { profile };
  };
  // Reserve before decoding, so concurrent callers cannot induce unbounded native decoder work.
  const reservation = await prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [ownerId]);
    const checked = await inspect(tx);
    if (checked.result) return checked;
    const quota = await consumeDiscoveryQuota(tx, ownerId, "photo");
    if (!quota.ok) return { result: quota };
    const id = randomUUID();
    await tx.discoveryPhoto.create({ data: { id, ownerId, profileId: checked.profile!.id, requestId: fields.requestId, payloadHash: hash, expectedRevision: fields.draftRevision, replacePhotoId: fields.replacePhotoId ?? null, publicId: photoPublicId(id) } });
    await tx.discoveryPhotoJob.create({ data: { photoId: id, kind: "RECONCILE", dedupeKey: jobKey(id), dueAt: new Date(Date.now() + idle) } });
    return { id };
  });
  if (!("id" in reservation)) return reservation.result;
  const id = reservation.id;
  let normalized: Awaited<ReturnType<typeof normalizePhoto>>;
  try { normalized = await normalizePhoto(bytes, mime); }
  catch {
    await prisma.$transaction(async tx => {
      await lockInvitationUsers(tx, [ownerId]);
      await tx.discoveryPhoto.update({ where: { id }, data: { state: "CHECK_FAILED", revokedAt: new Date(), destroyedAt: new Date(), publicId: null, reason: "Unsupported photo" } });
      await completeJob(tx, id);
    });
    return { ok: false, status: 400, error: "Use a still JPEG, PNG or WebP photo, at least 80px per side and no more than 5 MiB or 24 megapixels." };
  }
  const ready = await prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [ownerId]);
    const profile = await tx.discoveryProfile.findUnique({ where: { ownerId } });
    if (!uploadsEnabled() || !await isDiscoveryAdmitted(tx, ownerId, profile) || discoveryDraft(profile).revision !== fields.draftRevision) return false;
    const updated = await tx.discoveryPhoto.updateMany({ where: { id, deletedAt: null, revokedAt: null }, data: { width: normalized.width, height: normalized.height } });
    return updated.count === 1;
  });
  if (!ready) return finalizePhotoUpload(ownerId, id, null);
  let result = null;
  try { result = await provider.upload({ photoId: id, requestId: fields.requestId, jpeg: normalized.jpeg }); } catch { /* The durable job resolves ambiguous uploads. */ }
  return finalizePhotoUpload(ownerId, id, result);
}

export async function deletePhoto(ownerId: string, id: string, requestId: string, revision: number): Promise<PhotoResult<Profile>> {
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [ownerId]);
    const row = await tx.discoveryPhoto.findFirst({ where: { id, ownerId } });
    const profile = await tx.discoveryProfile.findUnique({ where: { ownerId } });
    if (!row || !profile) return missing;
    const replay = await tx.discoveryPhotoAudit.findUnique({ where: { actorId_requestId: { actorId: ownerId, requestId } } });
    const reason = `Owner deletion at draft revision ${revision}`;
    if (replay) return replay.photoId === id && replay.action === "DELETE" && replay.reason === reason ? ok(ownDiscoveryProfile(profile)) : stale;
    const draft = discoveryDraft(profile);
    if (revision !== draft.revision || !draft.profile || row.deletedAt) return stale;
    const now = new Date();
    const published = publicDiscoveryProfile(profile.id, profile.publishedSnapshot);
    const { id: _profileId, ...snapshot } = published ?? { id: "" };
    const updated = await tx.discoveryProfile.update({ where: { id: profile.id }, data: {
      draft: { revision: revision + 1, profile: { ...draft.profile, photoIds: (draft.profile.photoIds ?? []).filter(value => value !== id) } },
      ...(published?.photoIds?.includes(id) ? { publicationVersion: { increment: 1 }, publishedSnapshot: { ...snapshot, photoIds: published.photoIds.filter(value => value !== id) } } : {}),
    } });
    const deleted = await tx.discoveryPhoto.update({ where: { id }, data: { deletedAt: now, revokedAt: row.revokedAt ?? now, decisionRevision: { increment: 1 } } });
    await tx.discoveryPhotoAudit.create({ data: { photoId: id, actorId: ownerId, requestId, action: "DELETE", reason, decisionRevision: deleted.decisionRevision } });
    await queuePhotoDestroy(tx, id, row.assetId ? now : new Date(now.getTime() + idle));
    await completeJob(tx, id);
    return ok(ownDiscoveryProfile(updated));
  });
}

export async function retryPhoto(ownerId: string, id: string, requestId: string, revision: number): Promise<PhotoResult<{ queued: true }>> {
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [ownerId]);
    const row = await tx.discoveryPhoto.findFirst({ where: { id, ownerId } });
    if (!row || row.deletedAt || row.revokedAt) return missing;
    const replay = await tx.discoveryPhotoAudit.findUnique({ where: { actorId_requestId: { actorId: ownerId, requestId } } });
    const reason = `Owner retry of decision ${revision}`;
    if (replay) return replay.photoId === id && replay.action === "RETRY" && replay.reason === reason ? ok({ queued: true }) : stale;
    if (row.decisionRevision !== revision || row.state !== "CHECK_FAILED" || !row.publicId) return stale;
    const profile = await tx.discoveryProfile.findUnique({ where: { ownerId } });
    if (!uploadsEnabled() || !await isDiscoveryAdmitted(tx, ownerId, profile)) return denied;
    const quota = await consumeDiscoveryQuota(tx, ownerId, "mutation"); if (!quota.ok) return quota;
    const updated = await tx.discoveryPhoto.update({ where: { id }, data: { state: "PROCESSING", reason: "Checking photo", decisionRevision: { increment: 1 } } });
    await tx.discoveryPhotoAudit.create({ data: { photoId: id, actorId: ownerId, requestId, action: "RETRY", reason, decisionRevision: updated.decisionRevision } });
    const dueAt = new Date(); const dedupeKey = jobKey(id);
    await tx.discoveryPhotoJob.upsert({ where: { dedupeKey }, create: { photoId: id, kind: "RECONCILE", dedupeKey, dueAt }, update: { dueAt, completedAt: null, failedAt: null, leaseToken: null, leaseUntil: null, attempts: 0 } });
    return ok({ queued: true });
  });
}
