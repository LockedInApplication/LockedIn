import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { notificationBroker } from "../notifications/notification.broker.js";
export async function recordInvitationNotification(tx: Prisma.TransactionClient, invitationId: string, recipientId: string) {
    return tx.notification.createMany({ data: [{
                recipientId, invitationId, relationshipId: null, kind: "INVITATION_RECEIVED",
                entityId: invitationId, wordKey: null, eventKey: `invitation-received:${invitationId}`,
            }], skipDuplicates: true });
}
export function resolveInvitationNotifications(tx: Prisma.TransactionClient, invitationId: string) {
    return tx.notification.updateMany({ where: { invitationId, resolvedAt: null }, data: { resolvedAt: new Date() } });
}
// Covers registration after an email invite and invitations created before this feature.
// Recipient identity always comes from the authenticated session, not the browser.
export async function ensureInvitationNotifications(user: {
    id: string;
    email: string;
}) {
    const count = await prisma.$transaction(async (tx) => {
        const pending = await tx.relationshipInvite.findMany({ where: { status: "PENDING", expiresAt: { gt: new Date() },
                OR: [{ inviteeId: user.id }, { inviteeEmail: { equals: user.email, mode: "insensitive" } }],
                notifications: { none: { recipientId: user.id, kind: "INVITATION_RECEIVED" } },
            }, orderBy: { id: "asc" }, take: 100 });
        let created = 0;
        for (const invitation of pending) {
            await tx.$queryRaw `SELECT "id" FROM "RelationshipInvite" WHERE "id" = ${invitation.id} FOR UPDATE`;
            const current = await tx.relationshipInvite.findUnique({ where: { id: invitation.id } });
            if (!current || current.status !== "PENDING" || !current.expiresAt || current.expiresAt <= new Date())
                continue;
            if (current.inviteeId !== user.id && current.inviteeEmail?.toLowerCase() !== user.email.toLowerCase())
                continue;
            if (current.inviteeId !== user.id)
                await tx.relationshipInvite.update({ where: { id: current.id }, data: { inviteeId: user.id } });
            created += (await recordInvitationNotification(tx, current.id, user.id)).count;
        }
        return created;
    });
    if (count)
        notificationBroker.publish(user.id);
}
