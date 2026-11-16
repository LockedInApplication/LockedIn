import type { Prisma } from "../../../generated/prisma/client.js";

// Call only after acquiring all affected account locks in database order.
// Canonical restrictions are independent from discovery's admission switch.
export async function closeDiscoveryContactUnderLock(tx: Prisma.TransactionClient, a: string, b: string) {
  await tx.discoveryConnection.updateMany({ where: { OR: [{ userLowId: a, userHighId: b }, { userLowId: b, userHighId: a }], state: { in: ["PENDING", "ACCEPTED"] } }, data: { state: "CLOSED", closedAt: new Date(), lowReadinessVersion: null, highReadinessVersion: null, consentVersion: { increment: 1 } } });
  await tx.notification.updateMany({ where: { resolvedAt: null, discoveryConnection: { OR: [{ userLowId: a, userHighId: b }, { userLowId: b, userHighId: a }], state: "CLOSED" } }, data: { resolvedAt: new Date() } });
}
