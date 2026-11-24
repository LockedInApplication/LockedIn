import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { lockDiscoveryUsers } from "../discovery/discovery-locks.js";
import { pairClosure } from "../messaging/messaging-conversation.service.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { MemoryError, type normalizeMemoryPhoto, type validateMemoryVoice } from "./memory-media.js";

const unavailable = () => new MemoryError(404, "This memory is not available.");
const photoLimit = 24;
const pinLimit = 8;
type Content = { text?: string; audio?: ReturnType<typeof validateMemoryVoice> };

async function activePair(tx: Prisma.TransactionClient, relationshipId: string, actorId: string) {
  const space = await tx.relationship.findFirst({
    where: {
      id: relationshipId,
      status: "ACTIVE",
      members: { some: { userId: actorId } },
      AND: [
        { OR: [{ directLockedInAt: { not: null } }, { discoveryConnection: { is: { state: "PROMOTED", lockedInAt: { not: null }, closedAt: null } } }] },
        { OR: [{ chatConversation: null }, { chatConversation: { is: { closedAt: null } } }] },
      ],
    },
    select: { members: { select: { userId: true } } },
  });
  if (space?.members.length !== 2) throw unavailable();
  return space.members.map(member => member.userId);
}

// Before decoding an upload, reject anyone who cannot use this space. The
// transaction checks again before publishing, under the same locks as leave/block.
export async function assertMemoryAccess(relationshipId: string, actorId: string) {
  const [a, b] = await activePair(prisma, relationshipId, actorId);
  if (await pairClosure(prisma, a!, b!)) throw unavailable();
}

async function withSpace<T>(relationshipId: string, actorId: string, action: (tx: Prisma.TransactionClient) => Promise<T>, changed = false) {
  const { value, members } = await prisma.$transaction(async tx => {
    const initial = await activePair(tx, relationshipId, actorId);
    await lockDiscoveryUsers(tx, initial);
    await tx.$queryRaw`SELECT "id" FROM "Relationship" WHERE "id" = ${relationshipId} FOR UPDATE`;
    const members = await activePair(tx, relationshipId, actorId);
    if (!members.every(id => initial.includes(id)) || await pairClosure(tx, members[0]!, members[1]!)) throw unavailable();
    return { value: await action(tx), members };
  });
  if (changed) for (const id of members) notificationBroker.publish(id, false);
  return value;
}

export function listMemories(relationshipId: string, actorId: string) {
  return withSpace(relationshipId, actorId, async tx => {
    const photos = await tx.togetherPhoto.findMany({
      where: { relationshipId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: photoLimit,
      select: {
        id: true, title: true, width: true, height: true, createdAt: true, uploaderId: true,
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
    return {
      photos: photos.map(({ uploaderId, pins, ...photo }) => ({
        ...photo, yours: uploaderId === actorId,
        pins: pins.map(({ notes, ...pin }) => ({
          ...pin,
          notes: notes.map(({ authorId, ...note }) => ({ ...note, yours: authorId === actorId })),
        })),
      })),
    };
  });
}

export function addMemoryPhoto(relationshipId: string, actorId: string, input: { id: string; title: string }, image: Awaited<ReturnType<typeof normalizeMemoryPhoto>>) {
  return withSpace(relationshipId, actorId, async tx => {
    const prior = await tx.togetherPhoto.findUnique({ where: { id: input.id }, select: { relationshipId: true, uploaderId: true } });
    if (prior) {
      if (prior.relationshipId !== relationshipId || prior.uploaderId !== actorId) throw unavailable();
      return { id: input.id };
    }
    if (await tx.togetherPhoto.count({ where: { relationshipId } }) >= photoLimit) {
      throw new MemoryError(409, "This space can hold 24 photos. Remove a photo you added before adding another.");
    }
    return tx.togetherPhoto.create({ data: { ...input, ...image, relationshipId, uploaderId: actorId }, select: { id: true } });
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
