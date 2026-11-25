import type { Prisma } from "../../../generated/prisma/client.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { withLockedTogether } from "../relationships/locked-together.service.js";

export class TogetherNotesUnavailable extends Error {
  constructor() { super("Notes aren’t available in this space."); }
}

const unavailable = () => new TogetherNotesUnavailable();
const serialize = (note?: { text: string; updatedAt: Date }) =>
  note ? { text: note.text, updatedAt: note.updatedAt.toISOString() } : null;

async function notesForPair(tx: Prisma.TransactionClient, relationshipId: string, actorId: string, partnerId: string) {
  const notes = await tx.togetherHomeNote.findMany({
    where: { relationshipId, authorId: { in: [actorId, partnerId] } },
    select: { authorId: true, text: true, updatedAt: true },
  });
  return {
    yours: serialize(notes.find(note => note.authorId === actorId)),
    partner: serialize(notes.find(note => note.authorId === partnerId)),
  };
}

export async function readTogetherNotes(relationshipId: string, actorId: string) {
  const { value } = await withLockedTogether(relationshipId, actorId, unavailable,
    (tx, partnerId) => notesForPair(tx, relationshipId, actorId, partnerId));
  return value;
}

export async function shareTogetherNote(relationshipId: string, actorId: string, text: string) {
  const { value, partnerId } = await withLockedTogether(relationshipId, actorId, unavailable, async (tx, partnerId) => {
    const where = { relationshipId_authorId: { relationshipId, authorId: actorId } };
    const existing = await tx.togetherHomeNote.findUnique({ where, select: { text: true } });
    const changed = existing?.text !== text;
    if (changed) await tx.togetherHomeNote.upsert({
      where, create: { relationshipId, authorId: actorId, text }, update: { text },
    });
    return { notes: await notesForPair(tx, relationshipId, actorId, partnerId), changed };
  });
  // Signal a quiet refresh only; don’t put private note text in notifications.
  if (value.changed) for (const userId of [actorId, partnerId]) notificationBroker.publish(userId, false);
  return value.notes;
}
