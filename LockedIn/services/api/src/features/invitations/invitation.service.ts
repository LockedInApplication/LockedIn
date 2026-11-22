import { prisma } from "../../lib/prisma.js";
import {invitationFailure as failure,INVITATION_UNAVAILABLE} from "./invitation.policy.js";
import {lockInvitationUsers as lockUsers,isInvitationRecipient as isRecipient,isPendingInvitation as isPending,activeDeclinePause,invitationBlockBetween,type InvitationUser as Recipient} from "./invitation-access.service.js";
import { persistTask, notificationBroker } from "../notifications/index.js";
import { recordInvitationNotification, resolveInvitationNotifications } from "./invitation-notifications.service.js";
import { inAppActivityAllowed } from "../notifications/notification-preferences.js";
import { sharedMessagingEnabled } from "../messaging/messaging.config.js";
import { attachDirectRelationshipConversation, openDirectInvitationChat } from "../messaging/messaging-conversation.service.js";
import { isDiscoveryLockedIn } from "../discovery/discovery-lock-in.js";
const startWithChat = sharedMessagingEnabled;

async function cannotInvite(tx: Parameters<typeof isDiscoveryLockedIn>[0], ids: string[], chatFirst: boolean) {
    if (chatFirst) {
        for (const id of ids) if (await isDiscoveryLockedIn(tx, id)) return true;
        return false;
    }
    return !!await tx.relationship.findFirst({ where: { status: "ACTIVE", members: { some: { userId: { in: ids } } } }, select: { id: true } });
}
export async function createInvitation(inviterId: string, email: string) {
    const result = await prisma.$transaction(async (tx) => {
        await lockUsers(tx, [inviterId]);
        if (await cannotInvite(tx, [inviterId], startWithChat()))
            return failure(409, "You can’t send new invitations right now.");
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
        notificationBroker.publish(result.recipientId,await inAppActivityAllowed(prisma,result.recipientId));
    if(result.ok)notificationBroker.publish(inviterId,false);
    return result;
}
export async function reviewInvitation(reference: string, user: Recipient, byId: boolean) {
    const invite = await prisma.relationshipInvite.findUnique({ where: byId ? { id: reference } : { token: reference }, include: { inviter: { select: { name: true, displayName: true } } } });
    if (!invite || !isRecipient(invite, user))
        return null;
    const status = invite.status === "PENDING" && !isPending(invite) ? "EXPIRED" : invite.status;
    const chatFirst = startWithChat();
    const occupied = status === "PENDING" && await cannotInvite(prisma, [invite.inviterId, user.id], chatFirst);
    const [restriction,ownBlock]=await Promise.all([
        invitationBlockBetween(prisma,invite.inviterId,user.id),
        prisma.invitationBlock.findUnique({where:{blockerId_blockedId:{blockerId:user.id,blockedId:invite.inviterId}},select:{id:true}}),
    ]);
    return { id: invite.id, token: invite.token, status, expiresAt: invite.expiresAt?.toISOString() ?? null,
        inviterName: invite.inviter.displayName ?? invite.inviter.name ?? "Someone", chatFirst,
        canRespond: status === "PENDING" && !occupied && !restriction,
        canBlock:!ownBlock,
        blockedReason: status === "PENDING" && (restriction || occupied) ? "This invitation is unavailable right now." : null };
}
// Compatibility for legacy flows that still require a space rather than a standalone chat.
export async function acceptInvitation(inviteId: string, inviterId: string, userId: string) {
    const result = await acceptInvitationWithMode(inviteId, inviterId, userId, false);
    if (!result.ok) return result;
    if (!result.relationship) throw Error("Legacy acceptance requires a relationship");
    return { ...result, relationship: result.relationship };
}

export function acceptDirectInvitation(inviteId: string, inviterId: string, userId: string) {
    return acceptInvitationWithMode(inviteId, inviterId, userId, startWithChat());
}

async function acceptInvitationWithMode(inviteId: string, inviterId: string, userId: string, chatFirst: boolean) {
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
        if (await cannotInvite(tx, [inviterId, userId], chatFirst))
            return failure(409, "This invitation is unavailable right now.");
        await tx.relationshipInvite.update({ where: { id: inviteId }, data: { status: "ACCEPTED", inviteeId: userId, acceptedAt: new Date() } });
        if (chatFirst) {
            const chat = await openDirectInvitationChat(tx, { invitationId: inviteId, inviterId, inviteeId: userId });
            await resolveInvitationNotifications(tx, inviteId);
            if (!chat.closedAt) await persistTask(tx, { recipientId: inviterId, relationshipId: null, conversationId: chat.id, kind: "DIRECT_INVITATION_ACCEPTED", entityId: chat.id, wordKey: null, eventKey: `invitation:${inviteId}` });
            return { ok: true as const, relationship: null, conversationId: chat.id };
        }
        const relationship = await tx.relationship.create({ data: { members: { create: [{ userId: inviterId }, { userId }] } } });
        if (sharedMessagingEnabled()) await attachDirectRelationshipConversation(tx, { relationshipId: relationship.id, invitationId: inviteId, inviterId, inviteeId: userId });
        await resolveInvitationNotifications(tx, inviteId);
        await persistTask(tx, { recipientId: inviterId, relationshipId: relationship.id, kind: "INVITATION_ACCEPTED", entityId: relationship.id, wordKey: null, eventKey: `invitation:${inviteId}` });
        return { ok: true as const, relationship, conversationId: null };
    });
    if (result.ok) {
        notificationBroker.publish(inviterId,await inAppActivityAllowed(prisma,inviterId));
        notificationBroker.publish(userId,await inAppActivityAllowed(prisma,userId));
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
