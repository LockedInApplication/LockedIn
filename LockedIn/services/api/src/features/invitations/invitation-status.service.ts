import { prisma } from "../../lib/prisma.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { resolveInvitationNotifications } from "./invitation-notifications.service.js";
import { lockInvitationUsers, lockInvitationRows, isPendingInvitation } from "./invitation-access.service.js";
import { senderInvitationStatus, invitationFailure } from "./invitation.policy.js";
export async function listSentInvitations(userId: string, before?: string) {
    if (before && !await prisma.relationshipInvite.findFirst({ where: { id: before, inviterId: userId }, select: { id: true } }))
        return invitationFailure(400, "Invalid invitation cursor.");
    const rows = await prisma.relationshipInvite.findMany({ where: { inviterId: userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31,
        ...(before ? { cursor: { id: before }, skip: 1 } : {}), select: { id: true, inviteeEmail: true, status: true, createdAt: true, expiresAt: true } });
    const page = rows.slice(0, 30);
    return { ok: true as const, items: page.map(invite => ({ id: invite.id, toEmail: invite.inviteeEmail ?? "Private invitation", status: senderInvitationStatus(invite), createdAt: invite.createdAt.toISOString(), expiresAt: invite.expiresAt?.toISOString() ?? null, canWithdraw: senderInvitationStatus(invite) === "PENDING" })), nextCursor: rows.length > 30 ? page.at(-1)!.id : null };
}
export async function withdrawInvitation(id: string, userId: string) {
    const result = await prisma.$transaction(async (tx) => {
        const initial = await tx.relationshipInvite.findFirst({ where: { id, inviterId: userId } });
        if (!initial)
            return invitationFailure(404, "Invitation not found.");
        await lockInvitationUsers(tx, [userId, ...(initial.inviteeId ? [initial.inviteeId] : [])]);
        await lockInvitationRows(tx, [id]);
        const current = await tx.relationshipInvite.findUniqueOrThrow({ where: { id } });
        if (!isPendingInvitation(current))
            return invitationFailure(409, "This invitation is no longer pending.");
        await tx.relationshipInvite.update({ where: { id }, data: { status: "CANCELED", withdrawnAt: new Date() } });
        await resolveInvitationNotifications(tx, id);
        return { ok: true as const, recipientId: current.inviteeId };
    });
    if (result.ok) {
        notificationBroker.publish(userId, false);
        if (result.recipientId)
            notificationBroker.publish(result.recipientId, false);
    }
    return result;
}
