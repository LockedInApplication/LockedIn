import { randomUUID } from "node:crypto";
import type { Prisma, RoomTalkMessageKind, RoomTalkStarterShelf } from "../../../generated/prisma/client.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { inAppActivityAllowed } from "../notifications/notification-preferences.js";
import { withLockedTogether } from "../relationships/locked-together.service.js";

export class RoomTalkError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export const roomUnavailable = () => new RoomTalkError(404, "This Room to Talk item is not available.");
const changed = () => new RoomTalkError(409, "This topic has changed. Check its latest status and try again.");
const starterShelves = [
  { id: "marriage", name: "Marriage", starter: "MARRIAGE" },
  { id: "date-ideas", name: "Date ideas", starter: "DATE_IDEAS" },
] as const;
const unsorted = { id: "unsorted", name: "Unsorted" };
const shelfLimit = 24;
const topicLimit = 250;
const messagePageSize = 50;
const leaseMs = 42000;
const maxViewersPerUser = 8;
const suggested = "ROOM_TALK_SUGGESTED";
const inPerson = "ROOM_TALK_IN_PERSON";
type NoticeKind = typeof suggested | typeof inPerson;
type Tx = Prisma.TransactionClient;

const topicSelect = {
  id: true, shelfId: true, starterShelf: true, question: true, phase: true, authorId: true, suggestedById: true,
  inPersonById: true, takeaway: true, updatedAt: true, _count: { select: { messages: true } },
} satisfies Prisma.RoomTalkTopicSelect;
type TopicRow = Prisma.RoomTalkTopicGetPayload<{ select: typeof topicSelect }>;
const messageSelect = {
  id: true, authorId: true, kind: true, body: true, createdAt: true, replyTo: { select: { id: true, authorId: true, body: true } },
} satisfies Prisma.RoomTalkMessageSelect;
type MessageRow = Prisma.RoomTalkMessageGetPayload<{ select: typeof messageSelect }>;
const who = (id: string | null, actor: string) => id === null ? null : id === actor ? "you" as const : "partner" as const;

function presentTopic(row: TopicRow, actorId: string) {
  const { authorId, suggestedById, inPersonById, starterShelf, shelfId, _count, ...fields } = row;
  return {
    ...fields, shelf: shelfId ?? starterShelves.find(item => item.starter === starterShelf)?.id ?? unsorted.id,
    yours: authorId === actorId, suggestedBy: who(suggestedById, actorId), inPersonBy: who(inPersonById, actorId), messageCount: _count.messages,
  };
}

function presentMessage(row: MessageRow, actorId: string) {
  const { authorId, replyTo, ...fields } = row;
  return { ...fields, yours: authorId === actorId, replyTo: replyTo && { id: replyTo.id, body: replyTo.body, yours: replyTo.authorId === actorId } };
}

type Result<T> = { data: T; changed?: boolean; notice?: { to: string; activity: boolean } };

async function updateRoom<T>(space: string, actorId: string, action: (tx: Tx, partnerId: string) => Promise<Result<T>>) {
  const { value, partnerId } = await withLockedTogether(space, actorId, roomUnavailable, action);
  if (value.changed) {
    notificationBroker.publish(actorId, false, "room");
    notificationBroker.publish(partnerId, false, "room");
  }
  if (value.notice) notificationBroker.publish(value.notice.to, value.notice.activity);
  return value.data;
}

async function queueNotice(tx: Tx, relationshipId: string, entityId: string, recipientId: string, kind: NoticeKind) {
  const enabled = await inAppActivityAllowed(tx, recipientId);
  await tx.notification.create({ data: {
    relationshipId, entityId, recipientId, kind, eventKey: JSON.stringify([kind, entityId, randomUUID()]), suppressed: !enabled,
  } });
  return enabled ? { to: recipientId, activity: true } : undefined;
}

async function resolveNotice(tx: Tx, relationshipId: string, entityId: string, recipientId: string, kind: NoticeKind) {
  const result = await tx.notification.updateMany({
    where: { relationshipId, entityId, recipientId, kind, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
  return result.count ? { to: recipientId, activity: false } : undefined;
}

async function requireTopic(tx: Tx, relationshipId: string, id: string) {
  const topic = await tx.roomTalkTopic.findFirst({ where: { relationshipId, id }, select: topicSelect });
  if (!topic) throw roomUnavailable();
  return topic;
}

async function shelfFields(tx: Tx, relationshipId: string, key: string): Promise<{ shelfId: string | null; starterShelf: RoomTalkStarterShelf | null }> {
  if (key === unsorted.id) return { shelfId: null, starterShelf: null };
  const starter = starterShelves.find(shelf => shelf.id === key);
  if (starter) return { shelfId: null, starterShelf: starter.starter };
  if (!await tx.roomTalkShelf.findFirst({ where: { relationshipId, id: key }, select: { id: true } })) throw roomUnavailable();
  return { shelfId: key, starterShelf: null };
}

export function listRoom(relationshipId: string, actorId: string) {
  return updateRoom(relationshipId, actorId, async tx => {
    const shelves = await tx.roomTalkShelf.findMany({ where: { relationshipId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true } });
    const topics = await tx.roomTalkTopic.findMany({ where: { relationshipId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: topicSelect });
    return { data: {
      shelves: [...starterShelves.map(({ id, name }) => ({ id, name })), ...shelves, unsorted],
      topics: topics.map(topic => presentTopic(topic, actorId)),
    } };
  });
}

export function addRoomShelf(relationshipId: string, actorId: string, input: { id: string; name: string }) {
  return updateRoom(relationshipId, actorId, async tx => {
    const existing = await tx.roomTalkShelf.findUnique({ where: { id: input.id }, select: { relationshipId: true, authorId: true, id: true, name: true } });
    if (existing) {
      if (existing.relationshipId !== relationshipId || existing.authorId !== actorId) throw roomUnavailable();
      if (existing.name !== input.name) throw new RoomTalkError(409, "This shelf was already saved with a different name.");
      return { data: { id: existing.id, name: existing.name } };
    }
    if ([...starterShelves, unsorted].some(shelf => shelf.name.toLowerCase() === input.name.toLowerCase()) ||
      await tx.roomTalkShelf.findFirst({ where: { relationshipId, name: { equals: input.name, mode: "insensitive" } }, select: { id: true } })) {
      throw new RoomTalkError(409, "You already have a shelf with that name.");
    }
    if (await tx.roomTalkShelf.count({ where: { relationshipId } }) >= shelfLimit) {
      throw new RoomTalkError(409, "This room can hold up to 24 custom shelves. Pick an existing shelf for your topic.");
    }
    return { data: await tx.roomTalkShelf.create({ data: { ...input, relationshipId, authorId: actorId }, select: { id: true, name: true } }), changed: true };
  });
}

export function addRoomTopic(relationshipId: string, actorId: string, input: { id: string; question: string; shelf: string }) {
  return updateRoom(relationshipId, actorId, async tx => {
    const prior = await tx.roomTalkTopic.findFirst({ where: { id: input.id }, select: { ...topicSelect, relationshipId: true } });
    if (prior) {
      if (prior.relationshipId !== relationshipId || prior.authorId !== actorId) throw roomUnavailable();
      if (prior.question !== input.question) throw new RoomTalkError(409, "This topic was already saved with a different question.");
      const { relationshipId: _, ...topic } = prior;
      return { data: presentTopic(topic, actorId) };
    }
    const shelf = await shelfFields(tx, relationshipId, input.shelf);
    if (await tx.roomTalkTopic.count({ where: { relationshipId } }) >= topicLimit) {
      throw new RoomTalkError(409, "This room has reached its 250-topic limit.");
    }
    const row = await tx.roomTalkTopic.create({
      data: { id: input.id, question: input.question, relationshipId, authorId: actorId, ...shelf }, select: topicSelect,
    });
    return { data: presentTopic(row, actorId), changed: true };
  });
}

export function fileRoomTopic(relationshipId: string, actorId: string, id: string, shelf: string) {
  return updateRoom(relationshipId, actorId, async tx => {
    const topic = await requireTopic(tx, relationshipId, id);
    if (topic.phase === "SUGGESTED") throw changed();
    if (presentTopic(topic, actorId).shelf === shelf) return { data: presentTopic(topic, actorId) };
    const data = await shelfFields(tx, relationshipId, shelf);
    const row = await tx.roomTalkTopic.update({ where: { id }, data, select: topicSelect });
    return { data: presentTopic(row, actorId), changed: true };
  });
}

type TopicAction = { action: "suggest" | "withdraw" | "start" | "later" | "reopen" } | { action: "discuss"; takeaway: string | null };
export function transitionRoomTopic(relationshipId: string, actorId: string, id: string, input: TopicAction) {
  return updateRoom(relationshipId, actorId, async (tx, partnerId) => {
    const topic = await requireTopic(tx, relationshipId, id);
    const ownSuggestion = topic.suggestedById === actorId;
    let data: Prisma.RoomTalkTopicUncheckedUpdateInput;
    let notice: Result<never>["notice"];
    switch (input.action) {
      case "suggest":
        if (topic.phase !== "SAVED") throw changed();
        data = { phase: "SUGGESTED", suggestedById: actorId };
        notice = await queueNotice(tx, relationshipId, id, partnerId, suggested);
        break;
      case "withdraw":
      case "start":
      case "later": {
        const withdraw = input.action === "withdraw";
        if (topic.phase !== "SUGGESTED" || topic.suggestedById !== (withdraw ? actorId : partnerId)) throw changed();
        data = { phase: input.action === "start" ? "TALK_NEXT" : "SAVED", suggestedById: null };
        notice = await resolveNotice(tx, relationshipId, id, ownSuggestion ? partnerId : actorId, suggested);
        break;
      }
      case "discuss":
        if (topic.phase !== "TALK_NEXT" && topic.phase !== "SAVED") throw changed();
        data = { phase: "DISCUSSED", inPersonById: null, takeaway: input.takeaway };
        if (topic.inPersonById) notice = await resolveNotice(tx, relationshipId, id, topic.inPersonById === actorId ? partnerId : actorId, inPerson);
        await tx.roomTalkPresence.deleteMany({ where: { topicId: id } });
        break;
      case "reopen":
        if (topic.phase !== "DISCUSSED") throw changed();
        data = { phase: "SAVED" };
        break;
    }
    const row = await tx.roomTalkTopic.update({ where: { id }, data, select: topicSelect });
    return { data: presentTopic(row, actorId), changed: true, notice };
  });
}

export function saveForInPerson(relationshipId: string, actorId: string, id: string, saved: boolean) {
  return updateRoom(relationshipId, actorId, async (tx, partnerId) => {
    const topic = await requireTopic(tx, relationshipId, id);
    if (topic.phase !== "TALK_NEXT") throw changed();
    if (Boolean(topic.inPersonById) === saved) return { data: presentTopic(topic, actorId) };
    let notice: Result<never>["notice"];
    if (saved) {
      const now = new Date();
      await tx.roomTalkPresence.deleteMany({ where: { topicId: id, expiresAt: { lte: now } } });
      const viewing = await tx.roomTalkPresence.findFirst({
        where: { topicId: id, userId: partnerId, expiresAt: { gt: now } }, select: { viewerId: true },
      });
      if (!viewing) notice = await queueNotice(tx, relationshipId, id, partnerId, inPerson);
    } else {
      notice = await resolveNotice(tx, relationshipId, id, topic.inPersonById === actorId ? partnerId : actorId, inPerson);
    }
    const row = await tx.roomTalkTopic.update({ where: { id }, data: { inPersonById: saved ? actorId : null }, select: topicSelect });
    return { data: presentTopic(row, actorId), changed: true, notice };
  });
}

export function roomConversation(relationshipId: string, actorId: string, id: string, before?: string) {
  return updateRoom(relationshipId, actorId, async tx => {
    await requireTopic(tx, relationshipId, id);
    const cursor = before && await tx.roomTalkMessage.findFirst({ where: { id: before, topicId: id }, select: { id: true, createdAt: true } });
    if (before && !cursor) throw roomUnavailable();
    const rows = await tx.roomTalkMessage.findMany({
      where: { topicId: id, ...(cursor ? { OR: [
        { createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: messagePageSize + 1, select: messageSelect,
    });
    const page = rows.slice(0, messagePageSize).reverse();
    return { data: { messages: page.map(row => presentMessage(row, actorId)), before: rows.length > messagePageSize ? page[0]!.id : null } };
  });
}

export function addRoomMessage(relationshipId: string, actorId: string, id: string, input: { id: string; kind: RoomTalkMessageKind; body: string; replyToId: string | null }) {
  return updateRoom(relationshipId, actorId, async (tx, partnerId) => {
    const topic = await requireTopic(tx, relationshipId, id);
    const existing = await tx.roomTalkMessage.findUnique({ where: { id: input.id }, select: { ...messageSelect, topicId: true } });
    if (existing) {
      if (existing.topicId !== id || existing.authorId !== actorId) throw roomUnavailable();
      if (existing.kind !== input.kind || existing.body !== input.body || (existing.replyTo?.id ?? null) !== input.replyToId) {
        throw new RoomTalkError(409, "This reply was already sent with different wording.");
      }
      const { topicId: _, ...message } = existing;
      return { data: presentMessage(message, actorId) };
    }
    if (topic.phase !== "TALK_NEXT") throw changed();
    if (input.replyToId && (input.kind !== "REPLY" || !await tx.roomTalkMessage.findFirst({
      where: { id: input.replyToId, topicId: id, authorId: partnerId, kind: "QUESTION" }, select: { id: true },
    }))) throw roomUnavailable();
    const row = await tx.roomTalkMessage.create({
      data: { ...input, topicId: id, authorId: actorId, createdAt: new Date() }, select: messageSelect,
    });
    return { data: presentMessage(row, actorId), changed: true };
  });
}

export function updateRoomPresence(relationshipId: string, actorId: string, topicId: string, viewerId: string, viewing: boolean) {
  return updateRoom(relationshipId, actorId, async tx => {
    const topic = await requireTopic(tx, relationshipId, topicId);
    const viewer = { topicId, userId: actorId, viewerId };
    if (!viewing) {
      await tx.roomTalkPresence.deleteMany({ where: viewer });
      return { data: { viewing: false } };
    }
    if (topic.phase !== "TALK_NEXT") throw changed();
    const now = new Date(), expiresAt = new Date(now.getTime() + leaseMs);
    await tx.roomTalkPresence.deleteMany({ where: { userId: actorId, expiresAt: { lte: now } } });
    const renewed = await tx.roomTalkPresence.updateMany({ where: viewer, data: { expiresAt } });
    if (!renewed.count) {
      if (await tx.roomTalkPresence.count({ where: { userId: actorId } }) >= maxViewersPerUser) return { data: { viewing: false } };
      await tx.roomTalkPresence.create({ data: { ...viewer, expiresAt } });
    }
    const read = topic.inPersonById && topic.inPersonById !== actorId ? await tx.notification.updateMany({
      where: { relationshipId, entityId: topicId, recipientId: actorId, kind: inPerson, readAt: null, resolvedAt: null, suppressed: false },
      data: { readAt: now },
    }) : null;
    return { data: { viewing: true }, notice: read?.count ? { to: actorId, activity: false } : undefined };
  });
}
