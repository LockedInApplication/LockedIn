import { prisma } from "../../lib/prisma.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { isInvitationRecipient, lockInvitationUsers, lockInvitationRows, invitationPairWhere, type InvitationUser } from "./invitation-access.service.js";
import { invitationFailure } from "./invitation.policy.js";
import { closeDiscoveryContactUnderLock } from "./invitation-restrictions.service.js";
export async function blockInvitationSender(token: string, user: InvitationUser) {
    const result = await prisma.$transaction(async (tx) => {
        const source = await tx.relationshipInvite.findUnique({ where: { token } });
        if (!source || !isInvitationRecipient(source, user) || source.inviterId === user.id)
            return invitationFailure(404, "Invitation not found.");
        await lockInvitationUsers(tx, [source.inviterId, user.id]);
        const inviter = await tx.user.findUniqueOrThrow({ where: { id: source.inviterId }, select: { id: true, email: true } });
        const block = await tx.invitationBlock.upsert({ where: { blockerId_blockedId: { blockerId: user.id, blockedId: inviter.id } }, update: {}, create: { blockerId: user.id, blockedId: inviter.id } });
        const pending = await tx.relationshipInvite.findMany({ where: { ...invitationPairWhere(user, inviter), status: "PENDING", expiresAt: { gt: new Date() } }, select: { id: true }, orderBy: { id: "asc" } });
        const ids = pending.map(item => item.id);
        await lockInvitationRows(tx, ids);
        if (ids.length) {
            // Blocking is not a new decline event. Never reset an existing pause.
            await tx.relationshipInvite.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "DECLINED" } });
            await tx.notification.updateMany({ where: { invitationId: { in: ids }, resolvedAt: null }, data: { resolvedAt: new Date() } });
        }
        await closeDiscoveryContactUnderLock(tx, user.id, inviter.id);
        return { ok: true as const, id: block.id, otherId: inviter.id };
    });
    if (result.ok) {
        notificationBroker.publish(user.id, false);
        notificationBroker.publish(result.otherId, false);
    }
    return result;
}
export async function listInvitationBlocks(userId: string, before?: string) {
    if (before && !await prisma.invitationBlock.findFirst({ where: { id: before, blockerId: userId }, select: { id: true } }))
        return invitationFailure(400, "Invalid invitation cursor.");
    const rows = await prisma.invitationBlock.findMany({ where: { blockerId: userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31, ...(before ? { cursor: { id: before }, skip: 1 } : {}), select: { id: true, createdAt: true, safePublicLabel: true, blocked: { select: { name: true, displayName: true } } } });
    const page = rows.slice(0, 30);
    return { ok: true as const, items: page.map(block => ({ id: block.id, name: block.safePublicLabel ?? block.blocked.displayName ?? block.blocked.name ?? "Account", createdAt: block.createdAt.toISOString() })), nextCursor: rows.length > 30 ? page.at(-1)!.id : null };
}
export async function unblockInvitations(id: string, userId: string) {
    const result = await prisma.$transaction(async (tx) => {
        const block = await tx.invitationBlock.findFirst({ where: { id, blockerId: userId } });
        if (!block)
            return invitationFailure(404, "Invitation setting not found.");
        await lockInvitationUsers(tx, [userId, block.blockedId]);
        const deleted = await tx.invitationBlock.deleteMany({ where: { id, blockerId: userId } });
        if (!deleted.count)
            return invitationFailure(404, "Invitation setting not found.");
        return { ok: true as const, otherId: block.blockedId };
    });
    if (result.ok) {
        notificationBroker.publish(userId, false);
        notificationBroker.publish(result.otherId, false);
    }
    return result;
}
