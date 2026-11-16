import type { Prisma } from "../../../../generated/prisma/client.js";
import type { PublicDiscoveryProfile } from "../discovery.types.js";
import { getPhotoConfig } from "./photo.config.js";
import type { PhotoCard } from "./photo.types.js";

export const photoMediaPath = (id: string) => `/api/discovery/photos/${id}/media`;
export async function enrichPublishedPhotos(tx: Prisma.TransactionClient, visible: PublicDiscoveryProfile[]) {
  const config = getPhotoConfig();
  const ids = config.enabled && config.configured ? visible.flatMap(card => card.photoIds ?? []) : [];
  const rows = ids.length ? await tx.discoveryPhoto.findMany({ where: { id: { in: ids }, state: "APPROVED", scanCompleted: true, deletedAt: null, revokedAt: null, destroyedAt: null, assetId: { not: null } }, select: { id: true, profileId: true, width: true, height: true } }) : [];
  const byId = new Map(rows.map(photo => [photo.id, photo]));
  return visible.map(({ photoIds, ...profile }) => {
    const photos: PhotoCard[] = [];
    for (const id of photoIds ?? []) {
      const photo = byId.get(id);
      if (photo?.profileId === profile.id && photo.width && photo.height) photos.push({ id, src: photoMediaPath(id), width: photo.width, height: photo.height });
    }
    return { ...profile, ...(photos.length ? { photos } : {}) };
  });
}
