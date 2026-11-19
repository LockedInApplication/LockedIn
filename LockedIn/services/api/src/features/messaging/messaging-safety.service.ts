import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { chatMissing, lockConversation } from "./messaging-access.service.js";
import { messageScope } from "./messaging-message.service.js";
import { blockContactUnderLock, closeDiscoverySourcesUnderLock } from "../invitations/invitation-restrictions.service.js";
import { consumeDiscoveryQuota } from "../discovery/discovery-throttle.service.js";
import { ensureDiscoveryConversation } from "./messaging-conversation.service.js";
import { lockDiscoveryUsers } from "../discovery/discovery-locks.js";

export async function reportMessage(actorId: string, input: { conversationId: string; messageId: string; reason: string; detail?: string; requestId: string; blockAlso?: boolean }) {
  return prisma.$transaction(async tx => {
    // Historical membership only: this grants report evidence, never list/send.
    const c = await lockConversation(tx,input.conversationId,actorId); if (!c) return chatMissing;
    const message = await tx.discoveryMessage.findFirst({ where: { ...messageScope(c), id: input.messageId } });
    const partnerId = c.userLowId === actorId ? c.userHighId : c.userLowId;
    if (!message || message.senderId !== partnerId) return chatMissing;
    const prior = await tx.discoveryReport.findUnique({ where: { reporterId_requestId: { reporterId: actorId, requestId: input.requestId } } });
    if (prior) return prior.sourceType === "MESSAGE" && prior.sourceId === message.id && (!prior.conversationId || prior.conversationId === c.id) ? { ok: true as const, value: { id: prior.id, received: true } } : { ok: false as const, status: 409, error: "This report changed. Please try again." };
    const quota = await consumeDiscoveryQuota(tx,actorId,"report"); if (!quota.ok) return quota;
    const partner = await tx.user.findUniqueOrThrow({ where: { id: partnerId }, select: { displayName: true } });
    const label = partner.displayName ?? "Your partner";
    const report = await tx.discoveryReport.create({ data: { reporterId: actorId, reportedUserId: partnerId, connectionId: c.discoveryConnectionId, conversationId: c.id, reason: input.reason, details: input.detail, requestId: input.requestId, sourceType: "MESSAGE", sourceId: message.id, evidence: { text: message.text, sentAt: message.createdAt.toISOString(), publicName: label } } });
    if (input.blockAlso) await blockContactUnderLock(tx,actorId,partnerId,label);
    return { ok: true as const, value: { id: report.id, received: true } };
  });
}

export async function reportLegacyMessage(actorId: string, input: { sourceId: string; reason: string; detail?: string; requestId: string; blockAlso?: boolean }) {
  const id = await prisma.$transaction(async tx => {
    const message = await tx.discoveryMessage.findUnique({ where: { id: input.sourceId } });
    if (!message?.connectionId || message.senderId === actorId) return null;
    const source = await tx.discoveryConnection.findUnique({ where: { id: message.connectionId } });
    if (!source || ![source.userLowId,source.userHighId].includes(actorId)) return null;
    await lockDiscoveryUsers(tx,[source.userLowId,source.userHighId]);
    return (await ensureDiscoveryConversation(tx,source.id)).id;
  });
  return id ? reportMessage(actorId,{ ...input, conversationId: id, messageId: input.sourceId }) : chatMissing;
}

export async function changeChatContact(actorId: string, conversationId: string, action: "block" | "close") {
  return prisma.$transaction(async tx => {
    const c = await lockConversation(tx,conversationId,actorId); if (!c) return chatMissing;
    const partnerId = c.userLowId === actorId ? c.userHighId : c.userLowId;
    if (action === "block") {
      const prior = await tx.invitationBlock.findUnique({ where: { blockerId_blockedId: { blockerId: actorId, blockedId: partnerId } } });
      if (prior) return { ok: true as const, value: { id: prior.id } };
      const quota = await consumeDiscoveryQuota(tx,actorId,"mutation"); if (!quota.ok) return quota;
      const partner = await tx.user.findUniqueOrThrow({ where: { id: partnerId }, select: { displayName: true } });
      const block = await blockContactUnderLock(tx,actorId,partnerId,partner.displayName ?? "Your partner");
      return { ok: true as const, value: { id: block.id } };
    }
    if (!c.closedAt) {
      if (c.discoveryConnectionId) await closeDiscoverySourcesUnderLock(tx,{ id: c.discoveryConnectionId });
      await tx.chatConversation.updateMany({ where: { id: c.id, closedAt: null }, data: { closedAt: new Date(), closureReason: "CONTACT_CLOSED" } });
      await tx.dateSpotRequest.deleteMany({ where: { conversationId: c.id } });
    }
    return { ok: true as const, value: { id: c.id } };
  });
}

// Suspension is account-wide even when the target never enrolled in Discovery.
// Existing audit history is the durable source; no synthetic profile is created.
export async function accountSuspended(tx: Prisma.TransactionClient, userId: string) {
  if ((await tx.discoveryProfile.findUnique({ where: { ownerId: userId }, select: { suspendedAt: true } }))?.suspendedAt) return true;
  const last = await tx.discoveryModerationAudit.findFirst({ where: { targetUserId: userId, action: { in: ["SUSPEND","RESTORE"] } }, orderBy: [{ createdAt: "desc" },{ id: "desc" }], select: { action: true } });
  return last?.action === "SUSPEND";
}
