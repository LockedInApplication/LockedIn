import type { Prisma } from "../../../generated/prisma/client.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { assertLockedTogether, withLockedTogether } from "../relationships/locked-together.service.js";
import { MemoryError, type normalizeMemoryPhoto, type validateMemoryVoice } from "./memory-media.js";

export const unavailable = () => new MemoryError(404, "This memory is not available.");
export const photoLimit = 24;
export const envelopeLimit = 24;
const pinLimit = 8;
type Content = { text?: string; audio?: ReturnType<typeof validateMemoryVoice> };

// Before decoding an upload, reject anyone who cannot use this space. The
// transaction checks again before publishing, under the same locks as leave/block.
export function assertMemoryAccess(relationshipId: string, actorId: string) {
  return assertLockedTogether(relationshipId, actorId, unavailable);
}

export async function withSpace<T>(relationshipId: string, actorId: string, action: (tx: Prisma.TransactionClient) => Promise<T>, changed = false) {
  const { value, partnerId } = await withLockedTogether(relationshipId, actorId, unavailable, action);
  if (changed) for (const id of [actorId, partnerId]) notificationBroker.publish(id, false);
  return value;
}

export function listMemories(relationshipId: string, actorId: string) {
  return withSpace(relationshipId, actorId, async tx => {
    const photos = await tx.togetherPhoto.findMany({
      where: { relationshipId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: photoLimit,
      select: {
        id: true, title: true, day: true, sourcePlanId: true, width: true, height: true, createdAt: true, uploaderId: true, envelopeId: true,
        pins: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true, title: true, x: true, y: true,
            notes: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: { id: true, authorId: true, text: true, voiceDurationMs: true, updatedAt: true },
            },
          },
        },
      },
    });
    const envelopes = await tx.togetherEnvelope.findMany({
      where: { relationshipId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: envelopeLimit,
      select: {
        id: true, title: true, day: true, tone: true, coverPhotoId: true,
        captions: { select: { authorId: true, text: true } },
      },
    });
    return {
      photos: photos.map(({ uploaderId, pins, day, sourcePlanId, ...photo }) => ({
        ...photo, yours: uploaderId === actorId,
        ...(day ? { day: day.toISOString().slice(0, 10) } : {}),
        ...(sourcePlanId ? { sourcePlanId } : {}),
        pins: pins.map(({ notes, ...pin }) => ({
          ...pin,
          notes: notes.map(({ authorId, ...note }) => ({ ...note, yours: authorId === actorId })),
        })),
      })),
      envelopes: envelopes.map(({ day, captions, ...envelope }) => ({
        ...envelope, day: day?.toISOString().slice(0, 10) ?? null,
        captions: captions.map(({ authorId, text }) => ({ text, yours: authorId === actorId })),
      })),
    };
  });
}

export async function requireMemoryEnvelope(tx: Prisma.TransactionClient, relationshipId: string, envelopeId: string) {
  const envelope = await tx.togetherEnvelope.findFirst({ where: { id: envelopeId, relationshipId } });
  if (!envelope) throw unavailable();
  return envelope;
}

export function addMemoryPhoto(relationshipId: string, actorId: string, input: {
  id: string; title: string; envelopeId?: string; sourcePlanId?: string;
}, image: Awaited<ReturnType<typeof normalizeMemoryPhoto>>) {
  return withSpace(relationshipId, actorId, async tx => {
    const prior = await tx.togetherPhoto.findUnique({
      where: { id: input.id }, select: { relationshipId: true, uploaderId: true, sourcePlanId: true },
    });
    if (prior) {
      if (prior.relationshipId !== relationshipId || prior.uploaderId !== actorId) throw unavailable();
      if (prior.sourcePlanId !== (input.sourcePlanId ?? null)) {
        throw new MemoryError(409, "This photo is already saved. Open it from Memories.");
      }
      return { id: input.id };
    }
    let day: Date | null = null;
    if (input.sourcePlanId) {
      // Plan edits and memory writes take the same pair and relationship locks.
      const plan = await tx.roadmapPlan.findFirst({
        where: { id: input.sourcePlanId, relationshipId },
        select: { status: true, day: true, memoryPhoto: { select: { id: true } } },
      });
      if (!plan) throw unavailable();
      if (plan.memoryPhoto) return { id: plan.memoryPhoto.id, existing: true };
      if (plan.status !== "DONE") throw new MemoryError(409, "This plan isn’t marked done. Return to Plans to check its status.");
      day = plan.day;
    }
    if (input.envelopeId) await requireMemoryEnvelope(tx, relationshipId, input.envelopeId);
    if (await tx.togetherPhoto.count({ where: { relationshipId } }) >= photoLimit) {
      throw new MemoryError(409, "This space can hold 24 photos. Remove a photo you added before adding another.");
    }
    return tx.togetherPhoto.create({ data: { ...input, ...image, day, relationshipId, uploaderId: actorId }, select: { id: true } });
  }, true);
}

export function readMemoryPhoto(relationshipId: string, actorId: string, photoId: string) {
  return withSpace(relationshipId, actorId, async tx => {
    const photo = await tx.togetherPhoto.findFirst({ where: { id: photoId, relationshipId }, select: { jpeg: true } });
    if (!photo) throw unavailable();
    return photo.jpeg;
  });
}

export function deleteMemoryPhoto(relationshipId: string, actorId: string, photoId: string) {
  return withSpace(relationshipId, actorId, async tx => {
    const result = await tx.togetherPhoto.deleteMany({ where: { id: photoId, relationshipId, uploaderId: actorId } });
    if (result.count !== 1) throw unavailable();
    return { removed: true };
  }, true);
}

export function addMemoryPin(relationshipId: string, actorId: string, photoId: string, input: { id: string; title: string; x: number; y: number }, content: Content) {
  return withSpace(relationshipId, actorId, async tx => {
    if (!await tx.togetherPhoto.findFirst({ where: { id: photoId, relationshipId }, select: { id: true } })) throw unavailable();
    const prior = await tx.togetherPhotoPin.findUnique({ where: { id: input.id }, select: { photoId: true } });
    if (prior) {
      if (prior.photoId !== photoId) throw unavailable();
      return { id: input.id };
    }
    if (await tx.togetherPhotoPin.count({ where: { photoId } }) >= pinLimit) {
      throw new MemoryError(409, "This photo already has eight details. Add your side to an existing pin.");
    }
    return tx.togetherPhotoPin.create({
      data: { ...input, photoId, notes: { create: { authorId: actorId, ...noteFields(content) } } },
      select: { id: true },
    });
  }, true);
}

function noteFields(content: Content) {
  return { ...(content.text !== undefined ? { text: content.text } : {}), ...content.audio };
}

async function requirePin(tx: Prisma.TransactionClient, relationshipId: string, photoId: string, pinId: string) {
  if (!await tx.togetherPhotoPin.findFirst({ where: { id: pinId, photoId, photo: { relationshipId } }, select: { id: true } })) throw unavailable();
}

export function shareMemoryNote(relationshipId: string, actorId: string, photoId: string, pinId: string, content: Content) {
  return withSpace(relationshipId, actorId, async tx => {
    await requirePin(tx, relationshipId, photoId, pinId);
    return tx.togetherPhotoNote.upsert({
      where: { pinId_authorId: { pinId, authorId: actorId } },
      create: { pinId, authorId: actorId, ...noteFields(content) },
      update: noteFields(content),
      select: { id: true, voiceDurationMs: true },
    });
  }, true);
}

export function readMemoryVoice(relationshipId: string, actorId: string, photoId: string, pinId: string, noteId: string) {
  return withSpace(relationshipId, actorId, async tx => {
    const note = await tx.togetherPhotoNote.findFirst({
      where: { id: noteId, pinId, pin: { photoId, photo: { relationshipId } } },
      select: { voice: true },
    });
    if (!note?.voice) throw unavailable();
    return note.voice;
  });
}

export function removeMemoryNotePart(relationshipId: string, actorId: string, photoId: string, pinId: string, part: "text" | "voice") {
  return withSpace(relationshipId, actorId, async tx => {
    await requirePin(tx, relationshipId, photoId, pinId);
    const note = await tx.togetherPhotoNote.findUnique({
      where: { pinId_authorId: { pinId, authorId: actorId } },
      select: { id: true, text: true, voiceDurationMs: true },
    });
    if (!note || (part === "text" ? !note.text : !note.voiceDurationMs)) throw unavailable();
    const remaining = part === "text" ? Boolean(note.voiceDurationMs) : Boolean(note.text);
    if (remaining) {
      await tx.togetherPhotoNote.update({ where: { id: note.id }, data: part === "text" ? { text: null } : { voice: null, voiceDurationMs: null } });
    } else {
      await tx.togetherPhotoNote.delete({ where: { id: note.id } });
      if (await tx.togetherPhotoNote.count({ where: { pinId } }) === 0) await tx.togetherPhotoPin.delete({ where: { id: pinId } });
    }
    return { removed: true };
  }, true);
}
