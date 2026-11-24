import type { TogetherEnvelopeTone } from "../../../generated/prisma/client.js";
import { MemoryError } from "./memory-media.js";
import { envelopeLimit, requireMemoryEnvelope, unavailable, withSpace } from "./memory.service.js";

type EnvelopeFields = { title: string; day: string | null; tone: TogetherEnvelopeTone };
type Filing = { photoIds: string[]; fromEnvelopeId: string | null; envelopeId: string | null };
const envelopeFields = ({ title, day, tone }: EnvelopeFields) => ({ title, day: day ? new Date(day + "T00:00:00Z") : null, tone });

export function createMemoryEnvelope(relationshipId: string, actorId: string, input: EnvelopeFields & { id: string }) {
  return withSpace(relationshipId, actorId, async tx => {
    const prior = await tx.togetherEnvelope.findUnique({ where: { id: input.id }, select: { relationshipId: true } });
    if (prior) {
      if (prior.relationshipId !== relationshipId) throw unavailable();
      return { id: input.id };
    }
    if (await tx.togetherEnvelope.count({ where: { relationshipId } }) >= envelopeLimit) {
      throw new MemoryError(409, "This space can hold 24 envelopes.");
    }
    return tx.togetherEnvelope.create({
      data: { id: input.id, relationshipId, ...envelopeFields(input) }, select: { id: true },
    });
  }, true);
}

export function updateMemoryEnvelope(relationshipId: string, actorId: string, envelopeId: string, input: EnvelopeFields & { coverPhotoId: string | null }) {
  return withSpace(relationshipId, actorId, async tx => {
    await requireMemoryEnvelope(tx, relationshipId, envelopeId);
    if (input.coverPhotoId && !await tx.togetherPhoto.findFirst({
      where: { id: input.coverPhotoId, relationshipId, envelopeId }, select: { id: true },
    })) throw new MemoryError(409, "Choose a cover photo that is still in this envelope.");
    return tx.togetherEnvelope.update({
      where: { id: envelopeId }, data: { ...envelopeFields(input), coverPhotoId: input.coverPhotoId }, select: { id: true },
    });
  }, true);
}

export function fileMemoryPhotos(relationshipId: string, actorId: string, { photoIds, fromEnvelopeId, envelopeId }: Filing) {
  return withSpace(relationshipId, actorId, async tx => {
    if (envelopeId) await requireMemoryEnvelope(tx, relationshipId, envelopeId);
    const photos = await tx.togetherPhoto.findMany({ where: { id: { in: photoIds }, relationshipId }, select: { id: true, envelopeId: true } });
    if (photos.length !== photoIds.length) throw unavailable();
    // Repeating the same filing is safe; never take a photo out of a newer location.
    if (photos.some(photo => photo.envelopeId !== fromEnvelopeId && photo.envelopeId !== envelopeId)) {
      throw new MemoryError(409, "One of these photos was moved. Reopen the picker to see where it is now.");
    }
    const moving = photos.filter(photo => photo.envelopeId !== envelopeId).map(photo => photo.id);
    if (moving.length) {
      if (fromEnvelopeId) await tx.togetherEnvelope.updateMany({
        where: { id: fromEnvelopeId, relationshipId, coverPhotoId: { in: moving } },
        data: { coverPhotoId: null },
      });
      await tx.togetherPhoto.updateMany({ where: { id: { in: moving }, relationshipId, envelopeId: fromEnvelopeId }, data: { envelopeId } });
    }
    return { filed: photoIds.length };
  }, true);
}

export function changeMemoryCaption(relationshipId: string, actorId: string, envelopeId: string, text: string | null) {
  return withSpace(relationshipId, actorId, async tx => {
    await requireMemoryEnvelope(tx, relationshipId, envelopeId);
    if (text === null) {
      await tx.togetherEnvelopeCaption.deleteMany({ where: { envelopeId, authorId: actorId } });
    } else {
      await tx.togetherEnvelopeCaption.upsert({
        where: { envelopeId_authorId: { envelopeId, authorId: actorId } },
        update: { text }, create: { envelopeId, authorId: actorId, text },
      });
    }
    return { saved: true };
  }, true);
}

export function removeMemoryEnvelope(relationshipId: string, actorId: string, envelopeId: string) {
  return withSpace(relationshipId, actorId, async tx => {
    await requireMemoryEnvelope(tx, relationshipId, envelopeId);
    if (await tx.togetherEnvelopeCaption.count({ where: { envelopeId } })) {
      throw new MemoryError(409, "Each person needs to remove their own caption before the envelope can be removed.");
    }
    // The foreign key puts every photo back in Loose photos. Files and pins are unchanged.
    await tx.togetherEnvelope.delete({ where: { id: envelopeId } });
    return { removed: true };
  }, true);
}
