import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { lockDiscoveryUsers } from "../discovery/discovery-locks.js";
import { pairClosure } from "../messaging/messaging-conversation.service.js";

type Unavailable = () => Error;

async function activePair(tx: Prisma.TransactionClient, relationshipId: string, actorId: string, unavailable: Unavailable) {
  const space = await tx.relationship.findFirst({
    where: {
      id: relationshipId,
      status: "ACTIVE",
      members: { some: { userId: actorId } },
      AND: [
        { OR: [{ directLockedInAt: { not: null } }, { discoveryConnection: { is: { state: "PROMOTED", lockedInAt: { not: null }, closedAt: null } } }] },
        { OR: [{ chatConversation: null }, { chatConversation: { is: { closedAt: null } } }] },
      ],
    },
    select: { members: { select: { userId: true } } },
  });
  const partner = space?.members.find(member => member.userId !== actorId);
  if (space?.members.length !== 2 || !partner) throw unavailable();
  return partner.userId;
}

export async function assertLockedTogether(relationshipId: string, actorId: string, unavailable: Unavailable) {
  const partnerId = await activePair(prisma, relationshipId, actorId, unavailable);
  if (await pairClosure(prisma, actorId, partnerId)) throw unavailable();
}

export function withLockedTogether<T>(
  relationshipId: string, actorId: string, unavailable: Unavailable,
  work: (tx: Prisma.TransactionClient, partnerId: string) => Promise<T>,
) {
  return prisma.$transaction(async tx => {
    const initial = await activePair(tx, relationshipId, actorId, unavailable);
    // Use the same account -> relationship lock order as leaving and blocking.
    await lockDiscoveryUsers(tx, [actorId, initial]);
    await tx.$queryRaw`SELECT "id" FROM "Relationship" WHERE "id" = ${relationshipId} FOR UPDATE`;
    const partnerId = await activePair(tx, relationshipId, actorId, unavailable);
    if (partnerId !== initial || await pairClosure(tx, actorId, partnerId)) throw unavailable();
    return { value: await work(tx, partnerId), partnerId };
  });
}
