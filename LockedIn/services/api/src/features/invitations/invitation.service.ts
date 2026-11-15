import { prisma } from "../../lib/prisma.js";

export async function acceptInvitation(inviteId: string, inviterId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
        const created = await tx.relationship.create({
          data: {
            members: {
              create: [{ userId: inviterId }, { userId: userId }],
            },
          },
        });

        await tx.relationshipInvite.update({
          where: { id: inviteId },
          data: {
            status: "ACCEPTED",
            inviteeId: userId,
            acceptedAt: new Date(),
          },
        });

        return created;
      });
}
