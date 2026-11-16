import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { inAppActivityAllowed } from "../notifications/notification-preferences.js";
export type DiscoveryNotificationKind = "DISCOVERY_INVITED" | "DISCOVERY_ACCEPTED" | "DISCOVERY_RESPONSE_SHARED" | "DISCOVERY_BUILD_READY" | "DISCOVERY_PROMOTED";
export type DiscoveryNotify = (recipientId: string, activity: boolean) => void;
export async function persistDiscoveryTask(tx: Prisma.TransactionClient, connectionId: string, recipientId: string, kind: DiscoveryNotificationKind, occurrenceKey: string) {
  const eventKey = `discovery:${connectionId}:${kind}:${occurrenceKey}`;
  if (await tx.notification.findUnique({ where: { recipientId_eventKey: { recipientId, eventKey } } })) return false;
  const suppressed = !await inAppActivityAllowed(tx, recipientId);
  await tx.notification.create({ data: { recipientId, relationshipId: null, discoveryConnectionId: connectionId, kind, entityId: connectionId, wordKey: null, eventKey, suppressed } });
  return !suppressed;
}
export async function resolveDiscoveryTasks(tx: Prisma.TransactionClient, connectionId: string, kinds?: DiscoveryNotificationKind[]) {
  await tx.notification.updateMany({ where: { discoveryConnectionId: connectionId, resolvedAt: null, ...(kinds ? { kind: { in: kinds } } : {}) }, data: { resolvedAt: new Date() } });
}
export async function publishDiscoveryEffects(effects: Map<string, boolean>) {
  for (const [id, activity] of effects) notificationBroker.publish(id, activity && await inAppActivityAllowed(prisma, id));
}
