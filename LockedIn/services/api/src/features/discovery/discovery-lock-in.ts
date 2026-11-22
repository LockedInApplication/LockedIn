import type { DiscoveryConnection, Prisma } from '../../../generated/prisma/client.js';

export const activeLockIn = { state: 'PROMOTED', lockedInAt: { not: null }, relationship: { status: 'ACTIVE' } } satisfies Prisma.DiscoveryConnectionWhereInput;
export const activeDirectLockIn = { status: 'ACTIVE', directLockedInAt: { not: null } } satisfies Prisma.RelationshipWhereInput;
export async function isDiscoveryLockedIn(tx: Pick<Prisma.TransactionClient, 'discoveryConnection' | 'relationship'>, userId: string) {
  return !!await tx.discoveryConnection.findFirst({ where: { ...activeLockIn, OR: [{ userLowId: userId }, { userHighId: userId }] }, select: { id: true } }) ||
    !!await tx.relationship.findFirst({ where: { ...activeDirectLockIn, members: { some: { userId } } }, select: { id: true } });
}
export async function connectionAllowsChat(tx: Pick<Prisma.TransactionClient, 'relationship'>, row: DiscoveryConnection) {
  if (row.closedAt) return false;
  if (row.state === 'ACCEPTED') return true;
  return row.state === 'PROMOTED' && !!row.lockedInAt && !!row.relationshipId &&
    !!await tx.relationship.findFirst({ where: { id: row.relationshipId, status: 'ACTIVE' }, select: { id: true } });
}
