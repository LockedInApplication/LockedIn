import { prisma } from "../../lib/prisma.js";
import { getDiscoveryConfig } from "../../config/env.js";
import type { DiscoveryCapabilities, DiscoveryContext } from "./discovery.types.js";

export async function getDiscoveryCapabilities(context: DiscoveryContext): Promise<DiscoveryCapabilities> {
  const config = getDiscoveryConfig();
  const [profile, connection, membership] = await Promise.all([
    prisma.discoveryProfile.findUnique({ where: { ownerId: context.userId }, select: { suspendedAt: true } }),
    prisma.discoveryConnection.findFirst({ where: { OR: [{ userLowId: context.userId }, { userHighId: context.userId }] }, select: { id: true } }),
    prisma.relationshipMember.findFirst({ where: { userId: context.userId, relationship: { status: "ACTIVE" } }, select: { relationshipId: true }, orderBy: { id: "asc" } }),
  ]);
  return {
    canDiscover: config.enabled && config.admissionConfigured && config.pilotUserIds.includes(context.userId) && context.emailVerified && !profile?.suspendedAt,
    canModerate: context.emailVerified && config.moderatorUserIds.includes(context.userId),
    hasHistory: connection !== null,
    canReflect: true,
    currentRelationshipId: membership?.relationshipId ?? null,
  };
}
