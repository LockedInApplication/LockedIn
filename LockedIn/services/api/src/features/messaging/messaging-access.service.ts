import type { ChatConversation, Prisma } from "../../../generated/prisma/client.js";
import { lockDiscoveryUsers } from "../discovery/discovery-locks.js";
import { discoveryPairEligible } from "../discovery/discovery-connection.service.js";
import { connectionAllowsChat } from "../discovery/discovery-lock-in.js";
import { sharedMessagingEnabled } from "./messaging.config.js";
import { pairClosure } from "./messaging-conversation.service.js";

export const chatMember = (c: ChatConversation, id: string) => c.userLowId === id || c.userHighId === id;
export const chatMissing = { ok: false as const, status: 404, error: "This chat isn’t available." };

export async function lockConversation(tx: Prisma.TransactionClient, id: string, actorId: string) {
  const previous = await tx.chatConversation.findUnique({ where: { id } });
  if (!previous || !chatMember(previous, actorId)) return null;
  await lockDiscoveryUsers(tx, [previous.userLowId, previous.userHighId]);
  if (previous.discoveryConnectionId) await tx.$queryRaw`SELECT id FROM "DiscoveryConnection" WHERE id = ${previous.discoveryConnectionId} FOR UPDATE`;
  if (previous.relationshipId) await tx.$queryRaw`SELECT id FROM "Relationship" WHERE id = ${previous.relationshipId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "ChatConversation" WHERE id = ${id} FOR UPDATE`;
  const current = await tx.chatConversation.findUnique({ where: { id } });
  return current && chatMember(current, actorId) ? current : null;
}

export async function conversationAllowsChat(tx: Prisma.TransactionClient, c: ChatConversation, legacyDiscovery = false) {
  if (c.closedAt || await pairClosure(tx, c.userLowId, c.userHighId)) return false;
  if (c.accessMode === "DISCOVERY" || legacyDiscovery && !sharedMessagingEnabled()) {
    if (!c.discoveryConnectionId || process.env.DISCOVERY_CHAT_ENABLED !== "true") return false;
    const source = await tx.discoveryConnection.findUnique({ where: { id: c.discoveryConnectionId } });
    return !!source && await connectionAllowsChat(tx, source) && await discoveryPairEligible(tx, source);
  }
  if (!sharedMessagingEnabled() || !c.relationshipId) return false;
  const rel = await tx.relationship.findUnique({ where: { id: c.relationshipId }, include: { members: { include: { user: true } } } });
  return !!rel && rel.status === "ACTIVE" && rel.members.length === 2 &&
    rel.members.every(m => [c.userLowId, c.userHighId].includes(m.userId) && m.user.emailVerified);
}

export async function openConversation(tx: Prisma.TransactionClient, id: string, actorId: string, legacyDiscovery = false) {
  const c = await lockConversation(tx, id, actorId);
  return c && await conversationAllowsChat(tx, c, legacyDiscovery) ? c : null;
}
