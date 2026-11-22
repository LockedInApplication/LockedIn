import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { photoPublicId } from "../discovery/photos/photo-cloudinary.js";
import { getPhotoConfig } from "../discovery/photos/photo.config.js";
import { runPhotoJobs } from "../discovery/photos/photo-jobs.service.js";
import { queuePhotoDestroy } from "../discovery/photos/photo-profile.service.js";
import type { PhotoProvider } from "../discovery/photos/photo.types.js";
import { eraseAccountRows, lockDeletionOwner } from "./account-deletion.data.js";

export const deletionReceiptSelect = { id: true, requestedAt: true } as const;
const ownerActions = ["DELETE", "RETRY"];
const protectedEvidence = async (tx: Prisma.TransactionClient, userId: string, now: Date) => {
  const [report, moderation, photoAudit, heldPhoto] = await Promise.all([
    tx.discoveryReport.findFirst({ where: { OR: [{ reporterId: userId }, { reportedUserId: userId }, { photo: { ownerId: userId } }] }, select: { id: true } }),
    tx.discoveryModerationAudit.findFirst({ where: { OR: [{ moderatorId: userId }, { targetUserId: userId }] }, select: { id: true } }),
    tx.discoveryPhotoAudit.findFirst({ where: { OR: [
      { actorId: userId, photo: { ownerId: { not: userId } } },
      { photo: { ownerId: userId }, OR: [{ actorId: { not: userId } }, { action: { notIn: ownerActions } }] },
    ] }, select: { id: true } }),
    tx.discoveryPhoto.findFirst({ where: { ownerId: userId, retentionUntil: { gt: now } }, select: { id: true } }),
  ]);
  return !!(report || moderation || photoAudit || heldPhoto);
};

const photoSelect = { id: true, publicId: true, assetId: true, assetVersion: true, destroyedAt: true, revokedAt: true } as const;
type Photo = Prisma.DiscoveryPhotoGetPayload<{ select: typeof photoSelect }>;
const erased = (photo: Photo) => !!photo.destroyedAt && photo.publicId === null && photo.assetId === null && photo.assetVersion === null;
function canDestroy(photo: Photo) {
  if (photo.destroyedAt || !photo.publicId) return false;
  try { return photo.publicId === photoPublicId(photo.id); } catch { return false; }
}

async function erasePhotoRows(tx: Prisma.TransactionClient, userId: string) {
  // Only owner-generated history can reach this point. Never delete moderation/appeal evidence.
  await tx.discoveryPhotoAudit.deleteMany({ where: { actorId: userId, action: { in: ownerActions }, photo: { ownerId: userId } } });
  await tx.discoveryPhotoJob.deleteMany({ where: { photo: { ownerId: userId } } });
  await tx.discoveryPhoto.deleteMany({ where: { ownerId: userId } });
}

/** The caller holds the account lock and has verified the current password. */
export async function prepareAccountDeletion(tx: Prisma.TransactionClient, userId: string, email: string, now = new Date()) {
  if (await protectedEvidence(tx, userId, now)) return { kind: "manual" as const };
  const photos = await tx.discoveryPhoto.findMany({ where: { ownerId: userId }, select: photoSelect });
  const pending = photos.filter(photo => !erased(photo));
  if (!pending.length) {
    if (photos.length) await erasePhotoRows(tx, userId);
    await eraseAccountRows(tx, userId, email);
    return { kind: "deleted" as const };
  }
  if (!getPhotoConfig().configured || pending.some(photo => !canDestroy(photo))) return { kind: "manual" as const };
  const receipt = await tx.accountDeletionRequest.upsert({
    where: { userId }, create: { userId, requestedAt: now, state: "CLEANING_PHOTOS" },
    update: { state: "CLEANING_PHOTOS" }, select: deletionReceiptSelect,
  });
  await tx.discoveryProfile.updateMany({ where: { ownerId: userId, pausedAt: null }, data: { pausedAt: now } });
  await tx.discoveryPhoto.updateMany({ where: { ownerId: userId, revokedAt: null, destroyedAt: null }, data: { revokedAt: now, decisionRevision: { increment: 1 } } });
  for (const photo of pending) {
    // A just-started upload can still be in flight even though its reference was revoked.
    await queuePhotoDestroy(tx, photo.id, photo.assetId ? now : new Date(+now + 60_000));
  }
  await tx.session.deleteMany({ where: { userId } });
  return { kind: "queued" as const, receipt };
}

export async function runAccountPhotoCleanup(provider: PhotoProvider, now = new Date()) {
  const pending = await prisma.accountDeletionRequest.findMany({
    where: { state: "CLEANING_PHOTOS" }, select: { id: true, userId: true },
    // Provider backoff on old jobs must not starve newer requests.
    orderBy: [{ lastCleanupCheckAt: { sort: "asc", nulls: "first" } }, { requestedAt: "asc" }], take: 25,
  });
  const settle = async (beforeDestroy: boolean) => {
    for (const request of pending) await prisma.$transaction(async tx => {
      const user = await lockDeletionOwner(tx, request.userId);
      if (!user || !(await tx.accountDeletionRequest.findFirst({ where: { id: request.id, state: "CLEANING_PHOTOS" }, select: { id: true } }))) return;
      const review = () => tx.accountDeletionRequest.update({ where: { id: request.id }, data: { state: "CLEANUP_NEEDS_REVIEW" } });
      if (await protectedEvidence(tx, request.userId, now)) { await review(); return; }
      if (beforeDestroy) {
        await tx.accountDeletionRequest.update({ where: { id: request.id }, data: { lastCleanupCheckAt: now } });
        return;
      }
      const photos = await tx.discoveryPhoto.findMany({ where: { ownerId: request.userId }, select: photoSelect });
      const remaining = photos.filter(photo => !erased(photo));
      if (!remaining.length) {
        await erasePhotoRows(tx, request.userId);
        await eraseAccountRows(tx, request.userId, user.email);
        return;
      }
      const jobs = await tx.discoveryPhotoJob.findMany({ where: { photoId: { in: remaining.map(p => p.id) }, kind: "DESTROY" }, select: { photoId: true, failedAt: true, completedAt: true } });
      if (jobs.length !== remaining.length || jobs.some(job => job.failedAt || job.completedAt)) await review();
    });
  };
  // Scope this background loop to confirmed account deletions; the normal photo worker is unchanged.
  await settle(true);
  await runPhotoJobs({ provider, now, batchSize: 10, deletionOwnerIds: pending.map(request => request.userId) });
  await settle(false);
}
