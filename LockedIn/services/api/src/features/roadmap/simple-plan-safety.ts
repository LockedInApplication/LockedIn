import type { Prisma } from "../../../generated/prisma/client.js";
import { roadmapReplyKind } from "./simple-plan-policy.js";

// Callers hold the affected account lock(s); proposals cannot be changed
// concurrently. Keep resolved history but never revive a pending unsafe request.
export async function cancelRestrictedRoadmapProposals(tx: Prisma.TransactionClient, ...members: string[]) {
  const relationship = { status: "ACTIVE" as const, AND: members.map(userId => ({ members: { some: { userId } } })) };
  await tx.roadmapPlan.updateMany({ where: { relationship, status: "PENDING" }, data: { status: "CANCELED", version: { increment: 1 } } });
  await tx.notification.updateMany({ where: { relationship, kind: roadmapReplyKind, resolvedAt: null }, data: { resolvedAt: new Date() } });
}
