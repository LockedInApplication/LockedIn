import type { ChatConversation, DiscoveryMessage, Prisma } from "../../../generated/prisma/client.js";
import { consumeDiscoveryQuota } from "../discovery/discovery-throttle.service.js";
import { inAppActivityAllowed } from "../notifications/notification-preferences.js";
import { datePlansEnabled } from "../date-plans/date-plan-config.js";
import { readStoredDatePlanEvent, type StoredDatePlanEvent } from "../date-plans/date-plan-types.js";
import type { ChatMessageView, ChatPage, ChatResult } from "./messaging.types.js";

export const messageScope = (c: ChatConversation): Prisma.DiscoveryMessageWhereInput => ({ OR: [{ conversationId: c.id }, ...(c.discoveryConnectionId ? [{ conversationId: null, connectionId: c.discoveryConnectionId }] : [])] });
export const messageView = (row: DiscoveryMessage, actorId: string): ChatMessageView => {
  const message: ChatMessageView = { id: row.id, sequence: String(row.sequence), author: row.senderId === actorId ? "self" : "partner", text: row.text, createdAt: row.createdAt.toISOString(), ...(row.dateSpotPlaceId ? { dateSpot: true as const } : {}) };
  const stored = datePlansEnabled() && row.datePlanEvent ? readStoredDatePlanEvent(row.datePlanEvent) : null;
  if (stored) {
    const { fingerprint: _fingerprint, ...snapshot } = stored;
    message.datePlanEvent = snapshot;
  }
  return message;
};
export async function listMessages(tx: Prisma.TransactionClient, c: ChatConversation, actorId: string, before?: string): Promise<ChatPage> {
  const rows = await tx.discoveryMessage.findMany({ where: { ...messageScope(c), ...(before ? { sequence: { lt: BigInt(before) } } : {}) }, orderBy: { sequence: "desc" }, take: 31 });
  const page = rows.slice(0, 30), nextCursor = rows.length > 30 ? String(page.at(-1)!.sequence) : null;
  return { items: page.reverse().map(row => messageView(row, actorId)), nextCursor };
}
export async function sendMessage(tx: Prisma.TransactionClient, c: ChatConversation, actorId: string, input: { text: string; requestId: string; dateSpotPlaceId?: string; datePlanEvent?: StoredDatePlanEvent }): Promise<ChatResult<ChatMessageView> & { notify?: string[] }> {
  const prior = await tx.discoveryMessage.findFirst({ where: { ...messageScope(c), senderId: actorId, requestId: input.requestId } });
  if (prior) {
    const priorEvent = prior.datePlanEvent === null ? null : readStoredDatePlanEvent(prior.datePlanEvent);
    if (prior.text !== input.text || prior.dateSpotPlaceId !== (input.dateSpotPlaceId ?? null) ||
      (prior.datePlanEvent !== null && !priorEvent) || priorEvent?.fingerprint !== input.datePlanEvent?.fingerprint) {
      return { ok: false, status: 409, error: "This message changed. Please try sending it again." };
    }
    return { ok: true, value: messageView(prior, actorId) };
  }
  const quota = await consumeDiscoveryQuota(tx, actorId, "chat"); if (!quota.ok) return quota;
  const recipient = actorId === c.userLowId ? c.userHighId : c.userLowId;
  const unreadAlertSuppressed = !await inAppActivityAllowed(tx, recipient);
  const saved = await tx.discoveryMessage.create({ data: { conversationId: c.id, connectionId: c.discoveryConnectionId, senderId: actorId, unreadAlertSuppressed, ...input } });
  return { ok: true, value: messageView(saved, actorId), notify: [c.userLowId, c.userHighId] };
}
