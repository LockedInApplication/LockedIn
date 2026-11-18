import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { lockDiscoveryUsers } from "../discovery/discovery-locks.js";
import { notificationBroker } from "../notifications/notification.broker.js";

// Callers hold all affected account locks first; closure is monotonic.
export async function closePairConversationsUnderLock(tx: Prisma.TransactionClient, a: string, b: string, reason: "BLOCK" | "SUSPENSION" | "CONTACT_CLOSED") {
  await tx.chatConversation.updateMany({ where: { closedAt: null, OR: [{ userLowId: a, userHighId: b }, { userLowId: b, userHighId: a }] }, data: { closedAt: new Date(), closureReason: reason } });
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
