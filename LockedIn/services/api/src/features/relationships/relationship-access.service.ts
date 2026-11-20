import { prisma } from "../../lib/prisma.js";

export async function isRelationshipMember(
  relationshipId: string,
  userId: string,
): Promise<boolean> {
  const membership = await prisma.relationshipMember.findUnique({
    where: { relationshipId_userId: { relationshipId, userId } },
  });

  return Boolean(membership);
}

export async function getActiveRelationship(userId: string) {
  return prisma.relationship.findFirst({
    where: {
      status: "ACTIVE",
      members: { some: { userId } },
    },
    include: {
      discoveryConnection: { select: { state: true, lockedInAt: true } },
      members: {
        include: {
          user: {
            select: { id: true, name: true, displayName: true, email: true, avatarPreset:true },
          },
        },
      },
    },
  });
}
