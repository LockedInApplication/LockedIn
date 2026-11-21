import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { invitationBlockBetween } from '../invitations/invitation-access.service.js';
import { activeLockIn } from './discovery-lock-in.js';
import { lockDiscoveryUsers } from './discovery-locks.js';
import { canUseDiscoveryHistory, hasStoredDiscoveryPublication } from './discovery-profile.service.js';
import { publicDiscoveryProfile } from './discovery-profile.view.js';
import { enrichPublishedPhotos } from './photos/photo-cards.service.js';

// Pause hides a profile from strangers, not from already accepted connections.
// This deliberately does not use candidate matching, distance or browse access.
export async function findConnectedProfile(tx: Prisma.TransactionClient, actorId: string, profileId: string, connectionId?: string) {
  const partner = await tx.discoveryProfile.findUnique({ where: { id: profileId } });
  if (!partner || partner.ownerId === actorId) return null;
  const connection = await tx.discoveryConnection.findFirst({ where: {
    ...(connectionId ? { id: connectionId } : {}),
    closedAt: null,
    AND: [
      { OR: [{ userLowId: actorId, userHighId: partner.ownerId }, { userLowId: partner.ownerId, userHighId: actorId }] },
      { OR: [{ state: 'ACCEPTED' }, activeLockIn] },
    ],
  }, select: { id: true } });
  if (!connection || await invitationBlockBetween(tx, actorId, partner.ownerId)) return null;
  const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
  if (!await canUseDiscoveryHistory(tx, actorId, actor) || !await canUseDiscoveryHistory(tx, partner.ownerId, partner)) return null;
  if (!hasStoredDiscoveryPublication({ ...partner, pausedAt: null })) return null;
  return partner;
}

export async function getConnectedProfile(actorId: string, connectionId: string) {
  const missing = { ok: false as const, status: 404, error: 'This profile is no longer available.' };
  return prisma.$transaction(async tx => {
    const connection = await tx.discoveryConnection.findUnique({ where: { id: connectionId } });
    if (!connection || ![connection.userLowId, connection.userHighId].includes(actorId)) return missing;
    await lockDiscoveryUsers(tx, [connection.userLowId, connection.userHighId]);
    const partnerId = connection.userLowId === actorId ? connection.userHighId : connection.userLowId;
    const candidate = await tx.discoveryProfile.findUnique({ where: { ownerId: partnerId }, select: { id: true } });
    const row = candidate && await findConnectedProfile(tx, actorId, candidate.id, connectionId);
    const profile = row && publicDiscoveryProfile(row.id, row.publishedSnapshot);
    if (!profile) return missing;
    const [value] = await enrichPublishedPhotos(tx, [profile]);
    return { ok: true as const, value: value! };
  });
}
