import type { Prisma } from "../../../generated/prisma/client.js";
import { invitationPairWhere, lockInvitationRows } from "./invitation-access.service.js";
import { blockPairConversationsUnderLock, closeUnbackfilledRelationshipChatsUnderLock } from "../messaging/messaging-lifecycle.service.js";
import { cancelRestrictedRoadmapProposals } from "../roadmap/simple-plan-safety.js";

// Call only after acquiring all affected account locks in database order.
// Canonical restrictions are independent from discovery's admission switch.
export async function closeDiscoveryContactUnderLock(tx: Prisma.TransactionClient, a: string, b: string) {
  await closeDiscoverySourcesUnderLock(tx, { OR: [{ userLowId: a, userHighId: b }, { userLowId: b, userHighId: a }] });
  await closeUnbackfilledRelationshipChatsUnderLock(tx,a,"BLOCK",b);
  await blockPairConversationsUnderLock(tx,a,b);
  await cancelRestrictedRoadmapProposals(tx,a,b);
}

export async function closeDiscoverySourcesUnderLock(tx: Prisma.TransactionClient, source: Prisma.DiscoveryConnectionWhereInput) {
  // Preserve the shared space and its Discovery pause, but never reopen its
  // Discovery contact merely because a block is later removed.
  await tx.discoveryConnection.updateMany({ where: { ...source, state: "PROMOTED", lockedInAt: { not: null }, closedAt: null }, data: { closedAt: new Date() } });
  await tx.discoveryConnection.updateMany({ where: { ...source, state: { in: ["PENDING", "ACCEPTED"] } }, data: { state: "CLOSED", closedAt: new Date(), lowReadinessVersion: null, highReadinessVersion: null, consentVersion: { increment: 1 } } });
  await tx.notification.updateMany({ where: { resolvedAt: null, discoveryConnection: { ...source, closedAt: { not: null } } }, data: { resolvedAt: new Date() } });
}

export async function blockContactUnderLock(tx: Prisma.TransactionClient, actorId: string, targetId: string, label: string) {
  const users = await tx.user.findMany({ where: { id: { in: [actorId,targetId] } }, select: { id: true, email: true } });
  const actor = users.find(u => u.id === actorId), target = users.find(u => u.id === targetId);
  if (!actor || !target) throw Error("Contact is unavailable");
  const pending = await tx.relationshipInvite.findMany({ where: { ...invitationPairWhere(actor,target), status: "PENDING" }, select: { id: true } });
  await lockInvitationRows(tx,pending.map(r => r.id));
  await tx.relationshipInvite.updateMany({ where: { id: { in: pending.map(r => r.id) }, status: "PENDING" }, data: { status: "DECLINED" } });
  await tx.notification.updateMany({ where: { invitationId: { in: pending.map(r => r.id) }, resolvedAt: null }, data: { resolvedAt: new Date() } });
  const block = await tx.invitationBlock.upsert({ where: { blockerId_blockedId: { blockerId: actorId, blockedId: targetId } }, create: { blockerId: actorId, blockedId: targetId, safePublicLabel: label }, update: { safePublicLabel: label } });
  await closeDiscoveryContactUnderLock(tx,actorId,targetId);
  return block;
}
