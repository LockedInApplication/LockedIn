import { prisma } from "../../../lib/prisma.js";
import { getDiscoveryConfig } from "../../../config/env.js";
import { lockInvitationUsers } from "../../invitations/invitation-access.service.js";
import { findVisibleDiscoveryProfile } from "../discovery-candidates.service.js";
import { draftPhotoIds, publishedPhotoIds } from "./photo-profile.service.js";
import { getPhotoConfig } from "./photo.config.js";
import type { PhotoAsset, PhotoProvider } from "./photo.types.js";

export async function isPhotoModerator(tx: Parameters<typeof findVisibleDiscoveryProfile>[0], actorId: string) {
  return getDiscoveryConfig().moderatorUserIds.includes(actorId) && !!(await tx.user.findUnique({ where: { id: actorId }, select: { emailVerified: true } }))?.emailVerified;
}
export async function getPhotoAccess(actorId: string, id: string, purpose: "ordinary" | "moderation") {
  return prisma.$transaction(async tx => {
    const initial = await tx.discoveryPhoto.findUnique({ where: { id }, select: { ownerId: true } });
    if (!initial) return null;
    await lockInvitationUsers(tx, [...new Set([actorId, initial.ownerId])]);
    const photo = await tx.discoveryPhoto.findUnique({ where: { id }, include: { profile: true } });
    if (!photo || photo.destroyedAt || !photo.publicId || !photo.assetId || !photo.assetVersion) return null;
    if (purpose === "moderation") {
      if (!await isPhotoModerator(tx, actorId)) return null;
      const evidence = await tx.discoveryReport.findFirst({ where: { photoId: id, OR: [{ resolvedAt: null }, { resolvedAt: { gt: new Date(Date.now() - 30 * 86_400_000) } }] }, select: { id: true } });
      const review = !photo.revokedAt && !photo.deletedAt && (photo.state === "NEEDS_REVIEW" || (photo.state === "REJECTED" && photo.appealedRevision === photo.decisionRevision));
      if (!review && !evidence) return null;
    } else {
      if (photo.deletedAt || photo.revokedAt || photo.state === "REJECTED") return null;
      if (photo.ownerId === actorId) {
        if (![...draftPhotoIds(photo.profile), ...publishedPhotoIds(photo.profile)].includes(id)) return null;
      } else {
        const config = getPhotoConfig();
        if (!config.enabled || !config.configured || photo.state !== "APPROVED" || !photo.scanCompleted) return null;
        const visible = await findVisibleDiscoveryProfile(tx, actorId, photo.profileId);
        if (!visible || !publishedPhotoIds(visible).includes(id)) return null;
      }
    }
    const asset: PhotoAsset = { publicId: photo.publicId, assetId: photo.assetId, version: photo.assetVersion, format: "jpg" };
    return { asset, decisionRevision: photo.decisionRevision, publicationVersion: photo.profile.publicationVersion };
  });
}

export async function readPhoto(actorId: string, id: string, purpose: "ordinary" | "moderation", provider: PhotoProvider) {
  const before = await getPhotoAccess(actorId, id, purpose);
  if (!before) return null;
  let bytes: Buffer;
  try { bytes = await provider.read(before.asset); } catch { return null; }
  const after = await getPhotoAccess(actorId, id, purpose);
  if (!after || before.decisionRevision !== after.decisionRevision || before.publicationVersion !== after.publicationVersion || before.asset.assetId !== after.asset.assetId || before.asset.publicId !== after.asset.publicId || before.asset.version !== after.asset.version) return null;
  return bytes;
}
