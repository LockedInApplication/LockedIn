import { randomUUID } from "node:crypto";
import type { ChatConversation, Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { consumeDiscoveryQuota } from "../discovery/discovery-throttle.service.js";
import { notificationBroker, persistTask } from "../notifications/index.js";
import { inAppActivityAllowed } from "../notifications/notification-preferences.js";
import { chatMissing, openConversation } from "./messaging-access.service.js";

const requestKind = "DIRECT_LOCK_IN_REQUEST";
const unavailable = { ok: false as const, status: 409, error: "You can’t lock in from this chat right now." };
const changed = { ok: false as const, status: 409, error: "This Lock In request changed. Review the latest choice." };
export type DirectLockInView =
  | { state: "available" | "locked" }
  | { state: "requested" | "received"; requestId: string };

const supportsDirectLockIn = (chat: ChatConversation) => chat.accessMode === "DIRECT_INVITATION" ||
  (chat.accessMode === "RELATIONSHIP" && (chat.origin === "DIRECT_INVITATION" || !!chat.directInvitationId));

export async function directLockInView(tx: Prisma.TransactionClient, chat: ChatConversation, actorId: string): Promise<DirectLockInView | null> {
  if (!supportsDirectLockIn(chat)) return null;
  const space = chat.relationshipId ? await tx.relationship.findUnique({ where: { id: chat.relationshipId }, select: { directLockedInAt: true, status: true } }) : null;
  if (space?.directLockedInAt && space.status === "ACTIVE") return { state: "locked" };
  if (await tx.relationship.findFirst({
    where: { status: "ACTIVE", ...(chat.relationshipId ? { id: { not: chat.relationshipId } } : {}),
      members: { some: { userId: { in: [chat.userLowId, chat.userHighId] } } },
    },
    select: { id: true },
  })) return null;
  if (chat.lockInRequestId && chat.lockInRequestedBy) {
    return { state: chat.lockInRequestedBy === actorId ? "requested" : "received", requestId: chat.lockInRequestId };
  }
  return { state: "available" };
}

export async function resolveDirectLockInRequests(tx: Prisma.TransactionClient, conversationIds: string[]) {
  if (conversationIds.length) await tx.notification.updateMany({
    where: { kind: requestKind, entityId: { in: conversationIds }, resolvedAt: null }, data: { resolvedAt: new Date() },
  });
}

type Choice = { action: "request" } | { action: "confirm" | "withdraw" | "pass"; requestId: string };

export async function chooseDirectLockIn(actorId: string, conversationId: string, choice: Choice) {
  // openConversation holds both account locks, plus the conversation and any linked space.
  // Discovery promotion and direct invitation acceptance take the same account locks.
  const result = await prisma.$transaction(async tx => {
    const chat = await openConversation(tx, conversationId, actorId);
    if (!chat || !supportsDirectLockIn(chat)) return chatMissing;
    const partnerId = actorId === chat.userLowId ? chat.userHighId : chat.userLowId;
    if (choice.action === "withdraw" || choice.action === "pass") {
      if (chat.lockInRequestId !== choice.requestId || !chat.lockInRequestedBy ||
        (choice.action === "withdraw") !== (chat.lockInRequestedBy === actorId)) return changed;
      await tx.chatConversation.update({ where: { id: chat.id }, data: { lockInRequestedBy: null, lockInRequestId: null } });
      await resolveDirectLockInRequests(tx, [chat.id]);
      return { ok: true as const, value: await directLockInView(tx, { ...chat, lockInRequestedBy: null, lockInRequestId: null }, actorId), partnerId, alert: false };
    }
    const current = await directLockInView(tx, chat, actorId);
    if (!current) return unavailable;
    if (current.state === "locked") return { ok: true as const, value: current, partnerId, alert: false };
    if (choice.action === "request") {
      if (current.state === "requested") return { ok: true as const, value: current, partnerId, alert: false };
      if (current.state !== "available") return changed;
      const quota = await consumeDiscoveryQuota(tx, actorId, "mutation");
      if (!quota.ok) return quota;
      const requestId = randomUUID();
      await tx.chatConversation.update({ where: { id: chat.id }, data: { lockInRequestedBy: actorId, lockInRequestId: requestId } });
      await persistTask(tx, { kind: requestKind, recipientId: partnerId, entityId: chat.id, conversationId: chat.id, eventKey: `direct-lock-in:${requestId}`, wordKey: null, relationshipId: null });
      return { ok: true as const, value: { state: "requested" as const, requestId }, partnerId, alert: true };
    }
    if (current.state !== "received" || current.requestId !== choice.requestId) return changed;
    const now = new Date();
    const relationship = chat.relationshipId ? await tx.relationship.update({ where: { id: chat.relationshipId }, data: { directLockedInAt: now } })
      : await tx.relationship.create({ data: { directLockedInAt: now, members: { create: [
        { userId: chat.userLowId }, { userId: chat.userHighId },
      ] } } });
    await tx.chatConversation.update({ where: { id: chat.id }, data: { relationshipId: relationship.id, accessMode: "RELATIONSHIP", lockInRequestedBy: null, lockInRequestId: null } });
    await tx.discoveryProfile.updateMany({ where: { ownerId: { in: [chat.userLowId, chat.userHighId] } }, data: { pausedAt: now } });
    await resolveDirectLockInRequests(tx, [chat.id]);
    return { ok: true as const, value: { state: "locked" as const }, partnerId, alert: false };
  });
  if (result.ok) {
    notificationBroker.publish(actorId, false, "chat");
    notificationBroker.publish(result.partnerId, result.alert && await inAppActivityAllowed(prisma, result.partnerId), "chat");
  }
  return result;
}
