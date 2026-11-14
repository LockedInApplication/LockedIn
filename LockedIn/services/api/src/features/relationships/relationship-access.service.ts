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
