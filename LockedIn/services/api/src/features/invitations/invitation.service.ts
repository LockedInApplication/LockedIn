import { prisma } from "../../lib/prisma.js";
import {invitationFailure as failure,INVITATION_UNAVAILABLE} from "./invitation.policy.js";
import {lockInvitationUsers as lockUsers,isInvitationRecipient as isRecipient,isPendingInvitation as isPending,activeDeclinePause,invitationBlockBetween,type InvitationUser as Recipient} from "./invitation-access.service.js";
import { persistTask, notificationBroker } from "../notifications/index.js";
import { recordInvitationNotification, resolveInvitationNotifications } from "./invitation-notifications.service.js";
export async function createInvitation(inviterId: string, email: string) {
    const result = await prisma.$transaction(async (tx) => {
        await lockUsers(tx, [inviterId]);
        if (await tx.relationship.findFirst({ where: { status: "ACTIVE", members: { some: { userId: inviterId } } } }))
            return failure(409, "You already have an active relationship space.");
        const recipient = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
        if((recipient && await invitationBlockBetween(tx,inviterId,recipient.id)) || await activeDeclinePause(tx,inviterId,{id:recipient?.id,email}))return failure(409,INVITATION_UNAVAILABLE);
        const existing = await tx.relationshipInvite.findFirst({ where: { inviterId, inviteeEmail: email, status: "PENDING", expiresAt: { gt: new Date() } } });
        const invite = existing ?? await tx.relationshipInvite.create({ data: { inviterId, inviteeId: recipient?.id ?? null, inviteeEmail: email, expiresAt: new Date(Date.now() + 7 * 86400000) } });
        if (recipient) {
            if (invite.inviteeId !== recipient.id)
                await tx.relationshipInvite.update({ where: { id: invite.id }, data: { inviteeId: recipient.id } });
            await recordInvitationNotification(tx, invite.id, recipient.id);
        }
        return { ok: true as const, invite, created: !existing, recipientId: recipient?.id ?? null };
    });
    if (result.ok && result.recipientId)
        notificationBroker.publish(result.recipientId);
    if(result.ok)notificationBroker.publish(inviterId,false);
    return result;
}
export async function reviewInvitation(reference: string, user: Recipient, byId: boolean) {
    const invite = await prisma.relationshipInvite.findUnique({ where: byId ? { id: reference } : { token: reference }, include: { inviter: { select: { name: true, displayName: true } } } });
    if (!invite || !isRecipient(invite, user))
        return null;
    const status = invite.status === "PENDING" && !isPending(invite) ? "EXPIRED" : invite.status;
    const occupied = await prisma.relationship.findFirst({ where: { status: "ACTIVE", members: { some: { userId: { in: [invite.inviterId, user.id] } } } }, select: { id: true } });
    const [restriction,ownBlock]=await Promise.all([
        invitationBlockBetween(prisma,invite.inviterId,user.id),
        prisma.invitationBlock.findUnique({where:{blockerId_blockedId:{blockerId:user.id,blockedId:invite.inviterId}},select:{id:true}}),
    ]);
    return { id: invite.id, token: invite.token, status, expiresAt: invite.expiresAt?.toISOString() ?? null,
        inviterName: invite.inviter.displayName ?? invite.inviter.name ?? "Someone",
        canRespond: status === "PENDING" && !occupied && !restriction,
        canBlock:!ownBlock,
        blockedReason: status === "PENDING" && restriction?"This invitation is unavailable right now.":status === "PENDING" && occupied ? "One of you already has an active shared space. You cannot accept another invitation right now." : null };
}
export async function acceptInvitation(inviteId: string, inviterId: string, userId: string) {
    const result = await prisma.$transaction(async (tx) => {
        await lockUsers(tx, [inviterId, userId]);
        await tx.$queryRaw `SELECT "id" FROM "RelationshipInvite" WHERE "id" = ${inviteId} FOR UPDATE`;
        const invite = await tx.relationshipInvite.findUnique({ where: { id: inviteId } });
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
        if (!invite || !user || invite.inviterId !== inviterId || !isRecipient(invite, user))
            return failure(404, "Invitation not found.");
        if (!isPending(invite))
            return failure(409, "This invitation has expired or has already been handled.");
        if (inviterId === userId)
            return failure(400, "You cannot accept your own invitation.");
        if(await invitationBlockBetween(tx,inviterId,userId) || await activeDeclinePause(tx,inviterId,user))return failure(409,"This invitation is unavailable right now.");
        if (await tx.relationship.findFirst({ where: { status: "ACTIVE", members: { some: { userId: { in: [inviterId, userId] } } } } }))
            return failure(409, "One of you already has an active relationship space.");
        const relationship = await tx.relationship.create({ data: { members: { create: [{ userId: inviterId }, { userId }] } } });
        await tx.relationshipInvite.update({ where: { id: inviteId }, data: { status: "ACCEPTED", inviteeId: userId, acceptedAt: new Date() } });
        await resolveInvitationNotifications(tx, inviteId);
        await persistTask(tx, { recipientId: inviterId, relationshipId: relationship.id, kind: "INVITATION_ACCEPTED", entityId: relationship.id, wordKey: null, eventKey: `invitation:${inviteId}` });
        return { ok: true as const, relationship };
    });
    if (result.ok) {
        notificationBroker.publish(inviterId);
        notificationBroker.publish(userId);
    }
    return result;
}
export async function declineInvitation(token: string, user: Recipient) {
    const result = await prisma.$transaction(async (tx) => {
        const initial = await tx.relationshipInvite.findUnique({ where: { token } });
        if (!initial || !isRecipient(initial, user))
            return failure(404, "Invitation not found.");
        await lockUsers(tx, [initial.inviterId, user.id]);
        await tx.$queryRaw `SELECT "id" FROM "RelationshipInvite" WHERE "id" = ${initial.id} FOR UPDATE`;
        const current = await tx.relationshipInvite.findUniqueOrThrow({ where: { id: initial.id } });
        if (!isPending(current))
            return failure(409, "This invitation has expired or has already been handled.");
        await tx.relationshipInvite.update({ where: { id: current.id }, data: { status: "DECLINED", inviteeId: user.id,declinedAt:new Date() } });
        await resolveInvitationNotifications(tx, current.id);
        return { ok: true as const };
    });
    if (result.ok){
        notificationBroker.publish(user.id,false);
        const invite=await prisma.relationshipInvite.findUnique({where:{token},select:{inviterId:true}});
        if(invite)notificationBroker.publish(invite.inviterId,false);
    }
    return result;
}
