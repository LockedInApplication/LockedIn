import type { DiscoveryProfile, Prisma } from "../../../../generated/prisma/client.js";
import { discoveryDraft, publicDiscoveryProfile } from "../discovery-profile.view.js";

export const draftPhotoIds = (profile: DiscoveryProfile) => discoveryDraft(profile).profile?.photoIds ?? [];
export const publishedPhotoIds = (profile: DiscoveryProfile) => publicDiscoveryProfile(profile.id, profile.publishedSnapshot)?.photoIds ?? [];

export async function removePhotoReferences(tx: Prisma.TransactionClient, profileId: string, id: string) {
  const profile = await tx.discoveryProfile.findUniqueOrThrow({ where: { id: profileId } });
  const draft = discoveryDraft(profile), published = publicDiscoveryProfile(profile.id, profile.publishedSnapshot);
  const inDraft = draft.profile?.photoIds?.includes(id), inPublication = published?.photoIds?.includes(id);
  if (!inDraft && !inPublication) return;
  const { id: _publicId, ...snapshot } = published ?? { id: "" };
  await tx.discoveryProfile.update({ where: { id: profileId }, data: {
    ...(inDraft && draft.profile ? { draft: { revision: draft.revision + 1, profile: { ...draft.profile, photoIds: draft.profile.photoIds!.filter(value => value !== id) } } } : {}),
    ...(inPublication ? { publicationVersion: { increment: 1 }, publishedSnapshot: { ...snapshot, photoIds: published!.photoIds!.filter(value => value !== id) } } : {}),
  } });
}

export async function validPhotoSelection(tx: Prisma.TransactionClient, profile: DiscoveryProfile | null, ids: string[], approved = false) {
  if (!ids.length) return true;
  if (!profile) return false;
  return await tx.discoveryPhoto.count({ where: { id: { in: ids }, profileId: profile.id, ownerId: profile.ownerId, deletedAt: null, revokedAt: null, ...(approved ? { state: "APPROVED" as const, scanCompleted: true, assetId: { not: null } } : {}) } }) === ids.length;
}

export async function queuePhotoDestroy(tx: Prisma.TransactionClient, photoId: string, dueAt = new Date()) {
  const dedupeKey = `destroy:${photoId}`;
  await tx.discoveryPhotoJob.upsert({ where: { dedupeKey }, create: { photoId, kind: "DESTROY", dedupeKey, dueAt }, update: {} });
}

/** Call with the owner lock. Unreferenced in-flight rows are handled by the upload finalizer. */
export async function revokeRemovedPhotos(tx: Prisma.TransactionClient, profile: DiscoveryProfile, priorIds: string[]) {
  const kept = new Set([...draftPhotoIds(profile), ...publishedPhotoIds(profile)]);
  for (const id of new Set(priorIds)) {
    if (kept.has(id)) continue;
    const updated = await tx.discoveryPhoto.updateMany({ where: { id, profileId: profile.id, ownerId: profile.ownerId, revokedAt: null }, data: { revokedAt: new Date(), decisionRevision: { increment: 1 } } });
    if (updated.count) await queuePhotoDestroy(tx, id);
  }
}
