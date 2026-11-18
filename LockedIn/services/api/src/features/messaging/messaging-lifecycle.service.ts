import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { lockDiscoveryUsers } from "../discovery/discovery-locks.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { ensureRelationshipConversation } from "./messaging-conversation.service.js";

export async function closeUnbackfilledRelationshipChatsUnderLock(tx: Prisma.TransactionClient, memberId: string, reason: "BLOCK" | "SUSPENSION", partnerId?: string) {
  const relationships = await tx.relationship.findMany({
    where: {
      status: "ACTIVE", chatConversation: null,
      members: { some: { userId: memberId } },
      ...(partnerId ? { AND: [{ members: { some: { userId: partnerId } } }] } : {}),
    },
    orderBy: { id: "asc" },
    select: { id: true, members: { select: { userId: true } } },
  });
  const pairs = relationships.filter(relationship => relationship.members.length === 2);
  if (pairs.length === 0) return;
  const peers = [...new Set(pairs.flatMap(relationship => relationship.members.map(member => member.userId)).filter(id => id !== memberId))];
  const users = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "user" WHERE id IN (${Prisma.join(peers)}) ORDER BY id FOR KEY SHARE`;
  const retained = new Set([memberId, ...users.map(user => user.id)]);
  for (const pair of pairs) {
    if (pair.members.every(member => retained.has(member.userId))) await ensureRelationshipConversation(tx, pair.id, reason);
  }
}

// Callers hold all affected account locks first; closure is monotonic.
export async function blockPairConversationsUnderLock(tx: Prisma.TransactionClient, a: string, b: string) {
  await tx.chatConversation.updateMany({ where: { closedAt: null, OR: [{ userLowId: a, userHighId: b }, { userLowId: b, userHighId: a }] }, data: { closedAt: new Date(), closureReason: "BLOCK" } });
}
export async function closeDiscoveryConversationUnderLock(tx: Prisma.TransactionClient, discoveryConnectionId: string) {
  await tx.chatConversation.updateMany({ where: { discoveryConnectionId, closedAt: null }, data: { closedAt: new Date(), closureReason: "CONTACT_CLOSED" } });
}
export async function closeRelationshipConversationUnderLock(tx: Prisma.TransactionClient, relationshipId: string) {
  const c = await tx.chatConversation.findUnique({ where: { relationshipId } });
  // Explicit Discovery lock-in keeps its existing relationship-ending semantics.
  if (!c || c.accessMode !== "RELATIONSHIP") return;
  if (c.discoveryConnectionId) await tx.discoveryConnection.updateMany({ where: { id: c.discoveryConnectionId, closedAt: null }, data: { closedAt: new Date(), state: "CLOSED" } });
  await tx.chatConversation.updateMany({ where: { id: c.id, closedAt: null }, data: { closedAt: new Date(), closureReason: "RELATIONSHIP_ENDED" } });
}
export async function leaveMessagingRelationship(relationshipId: string, actorId: string) {
  const recipients = await prisma.$transaction(async tx => {
    const before = await tx.relationshipMember.findMany({ where: { relationshipId } });
    if (!before.some(m => m.userId === actorId)) return null;
    await lockDiscoveryUsers(tx, before.map(m => m.userId));
    await tx.$queryRaw`SELECT id FROM "Relationship" WHERE id = ${relationshipId} FOR UPDATE`;
    const current = await tx.relationship.findUnique({ where: { id: relationshipId }, include: { members: true } });
    if (!current?.members.some(m => m.userId === actorId)) return null;
    await closeRelationshipConversationUnderLock(tx, relationshipId);
    await tx.relationship.update({ where: { id: relationshipId }, data: { status: "ENDED" } });
    await tx.notification.updateMany({ where: { relationshipId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    return current.members.map(m => m.userId);
  });
  if (recipients) for (const id of recipients) notificationBroker.publish(id, false, "chat");
  return !!recipients;
}
