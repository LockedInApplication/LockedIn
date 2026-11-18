import type { ChatConversation, Prisma } from "../../../generated/prisma/client.js";
import { discoveryPairEligible } from "../discovery/discovery-connection.service.js";
import { conversationAllowsChat } from "./messaging-access.service.js";
import { sharedMessagingEnabled } from "./messaging.config.js";

// Callers hold both account locks in database order before source/conversation locks.
export async function pairClosure(tx: Prisma.TransactionClient, a: string, b: string) {
  const block = await tx.invitationBlock.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } });
  const suspension = await tx.discoveryProfile.findFirst({ where: { ownerId: { in: [a, b] }, suspendedAt: { not: null } } });
  return block ? "BLOCK" : suspension ? "SUSPENSION" : null;
}

export async function ensureDiscoveryConversation(tx: Prisma.TransactionClient, connectionId: string): Promise<ChatConversation> {
  await tx.$queryRaw`SELECT id FROM "DiscoveryConnection" WHERE id = ${connectionId} FOR UPDATE`;
  const source = await tx.discoveryConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const prior = await tx.chatConversation.findUnique({ where: { discoveryConnectionId: connectionId } });
  const reason = source.closedAt || source.state === "CLOSED" ? "CONTACT_CLOSED" : await pairClosure(tx, source.userLowId, source.userHighId);
  const relationshipId = source.lockedInAt ? source.relationshipId : null;
  let row = prior;
  if (!row) {
    row = await tx.chatConversation.create({ data: { id: source.id, userLowId: source.userLowId, userHighId: source.userHighId, origin: "DISCOVERY", accessMode: "DISCOVERY", discoveryConnectionId: source.id, relationshipId, ...(reason ? { closedAt: source.closedAt ?? new Date(), closureReason: reason } : {}) } });
  } else {
    if (row.userLowId !== source.userLowId || row.userHighId !== source.userHighId || (relationshipId && row.relationshipId && row.relationshipId !== relationshipId)) throw Error("Conversation source mismatch");
    row = await tx.chatConversation.update({ where: { id: row.id }, data: { ...(relationshipId && !row.relationshipId ? { relationshipId } : {}), ...(reason && !row.closedAt ? { closedAt: source.closedAt ?? new Date(), closureReason: reason } : {}) } });
  }
  await tx.discoveryMessage.updateMany({ where: { connectionId, conversationId: null }, data: { conversationId: row.id } });
  return row;
}

export async function ensureRelationshipConversation(tx: Prisma.TransactionClient, relationshipId: string): Promise<ChatConversation> {
  await tx.$queryRaw`SELECT id FROM "Relationship" WHERE id = ${relationshipId} FOR UPDATE`;
  const rel = await tx.relationship.findUniqueOrThrow({ where: { id: relationshipId }, include: { members: true, discoveryConnection: true } });
  if (rel.discoveryConnection?.lockedInAt) return ensureDiscoveryConversation(tx, rel.discoveryConnection.id);
  const users = await tx.user.findMany({ where: { id: { in: rel.members.map(m => m.userId) } }, orderBy: { id: "asc" }, select: { id: true } });
  if (users.length !== 2) throw Error("Conversation requires exactly two relationship members");
  const a = users[0]!.id, b = users[1]!.id;
  const prior = await tx.chatConversation.findUnique({ where: { relationshipId } });
  const reason = rel.status !== "ACTIVE" || rel.discoveryConnection?.closedAt ? "CONTACT_CLOSED" : await pairClosure(tx, a, b);
  if (prior) {
    if (prior.userLowId !== a || prior.userHighId !== b) throw Error("Conversation membership mismatch");
    return reason && !prior.closedAt ? tx.chatConversation.update({ where: { id: prior.id }, data: { closedAt: new Date(), closureReason: reason } }) : prior;
  }
  return tx.chatConversation.create({ data: { id: rel.id, userLowId: a, userHighId: b, origin: rel.discoveryConnection ? "LEGACY_RELATIONSHIP" : "DIRECT_INVITATION", accessMode: "RELATIONSHIP", relationshipId: rel.id, ...(reason ? { closedAt: new Date(), closureReason: reason } : {}) } });
}

export async function attachDirectRelationshipConversation(tx: Prisma.TransactionClient, input: { relationshipId: string; invitationId: string; inviterId: string; inviteeId: string }) {
  const existing = await tx.chatConversation.findUnique({ where: { relationshipId: input.relationshipId } });
  if (existing) return existing;
  const sources = await tx.discoveryConnection.findMany({ where: { state: "ACCEPTED", closedAt: null, relationshipId: null, OR: [{ userLowId: input.inviterId, userHighId: input.inviteeId }, { userHighId: input.inviterId, userLowId: input.inviteeId }] }, orderBy: { id: "asc" } });
  // Only a single unambiguous currently authorized history can be reused.
  if (process.env.DISCOVERY_CHAT_ENABLED === "true" && sources.length === 1 && await discoveryPairEligible(tx, sources[0]!)) {
    const c = await ensureDiscoveryConversation(tx, sources[0]!.id);
    if (!c.closedAt && !c.relationshipId) return tx.chatConversation.update({ where: { id: c.id }, data: { relationshipId: input.relationshipId, directInvitationId: input.invitationId, accessMode: "RELATIONSHIP" } });
  }
  const c = await ensureRelationshipConversation(tx, input.relationshipId);
  return tx.chatConversation.update({ where: { id: c.id }, data: { directInvitationId: input.invitationId } });
}

export async function attachPromotedRelationship(tx: Prisma.TransactionClient, input: { connectionId: string; relationshipId: string }) {
  const c = await ensureDiscoveryConversation(tx, input.connectionId);
  if (c.relationshipId !== input.relationshipId || c.accessMode !== "DISCOVERY") throw Error("Promoted conversation source mismatch");
  return c;
}

export async function samePairRelationshipConflict(tx: Prisma.TransactionClient, a: string, b: string) {
  if (!sharedMessagingEnabled()) return null;
  const rel = await tx.relationship.findFirst({ where: { status: "ACTIVE", AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }], members: { every: { userId: { in: [a,b] } } } }, include: { members: true, chatConversation: true } });
  if (!rel || rel.members.length !== 2) return null;
  const c = rel.chatConversation;
  return { ok: false as const, status: 409, error: "You already have a shared space together. Continue in Messages.", ...(c && await conversationAllowsChat(tx,c) ? { conversationId: c.id } : {}) };
}
