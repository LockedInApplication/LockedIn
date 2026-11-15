import { prisma } from "../../lib/prisma.js";
import { persistTask, notificationBroker } from "../notifications/index.js";

export async function acceptInvitation(inviteId: string, inviterId: string, userId: string) {
  const relationship = await prisma.$transaction(async (tx) => {
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

        await persistTask(tx,{recipientId:inviterId,relationshipId:created.id,kind:"INVITATION_ACCEPTED",entityId:created.id,wordKey:null,eventKey:`invitation:${inviteId}`});
        return created;
      });
  notificationBroker.publish(inviterId);
  return relationship;
}
