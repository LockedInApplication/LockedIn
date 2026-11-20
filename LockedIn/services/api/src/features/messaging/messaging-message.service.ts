import type { ChatConversation, DiscoveryMessage, Prisma } from "../../../generated/prisma/client.js";
import { consumeDiscoveryQuota } from "../discovery/discovery-throttle.service.js";
import { inAppActivityAllowed } from "../notifications/notification-preferences.js";
import type { ChatMessageView, ChatPage, ChatResult } from "./messaging.types.js";

export const messageScope = (c: ChatConversation): Prisma.DiscoveryMessageWhereInput => ({ OR: [{ conversationId: c.id }, ...(c.discoveryConnectionId ? [{ conversationId: null, connectionId: c.discoveryConnectionId }] : [])] });
const messageView = (row: DiscoveryMessage, actorId: string): ChatMessageView => ({ id: row.id, sequence: String(row.sequence), author: row.senderId === actorId ? "self" : "partner", text: row.text, createdAt: row.createdAt.toISOString(), ...(row.dateSpotPlaceId ? { dateSpot: true as const } : {}) });
export async function listMessages(tx: Prisma.TransactionClient, c: ChatConversation, actorId: string, before?: string): Promise<ChatPage> {
  const rows = await tx.discoveryMessage.findMany({ where: { ...messageScope(c), ...(before ? { sequence: { lt: BigInt(before) } } : {}) }, orderBy: { sequence: "desc" }, take: 31 });
  const page = rows.slice(0, 30), nextCursor = rows.length > 30 ? String(page.at(-1)!.sequence) : null;
  return { items: page.reverse().map(row => messageView(row, actorId)), nextCursor };
}
export async function sendMessage(tx: Prisma.TransactionClient, c: ChatConversation, actorId: string, input: { text: string; requestId: string; dateSpotPlaceId?: string }): Promise<ChatResult<ChatMessageView> & { notify?: string[] }> {
  const prior = await tx.discoveryMessage.findFirst({ where: { ...messageScope(c), senderId: actorId, requestId: input.requestId } });
  if (prior) return prior.text !== input.text || prior.dateSpotPlaceId !== (input.dateSpotPlaceId ?? null) ? { ok: false, status: 409, error: "This message changed. Please try sending it again." } : { ok: true, value: messageView(prior, actorId) };
  const quota = await consumeDiscoveryQuota(tx, actorId, "chat"); if (!quota.ok) return quota;
  const recipient = actorId === c.userLowId ? c.userHighId : c.userLowId;
  const unreadAlertSuppressed = !await inAppActivityAllowed(tx, recipient);
  const saved = await tx.discoveryMessage.create({ data: { conversationId: c.id, connectionId: c.discoveryConnectionId, senderId: actorId, unreadAlertSuppressed, ...input } });
  return { ok: true, value: messageView(saved, actorId), notify: [c.userLowId, c.userHighId] };
}
