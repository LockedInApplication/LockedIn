import { Prisma, type RelationshipInvite } from "../../../generated/prisma/client.js";
import { DECLINE_PAUSE_MS } from "./invitation.policy.js";
export type InvitationUser = {
    id: string;
    email: string;
};
export const isInvitationRecipient = (invite: RelationshipInvite, user: InvitationUser) => invite.inviteeId === user.id || invite.inviteeEmail?.toLowerCase() === user.email.toLowerCase();
export const isPendingInvitation = (invite: RelationshipInvite) => invite.status === "PENDING" && !!invite.expiresAt && invite.expiresAt > new Date();
export async function lockInvitationUsers(tx: Prisma.TransactionClient, ids: string[]) {
    // NO KEY UPDATE serializes connection decisions without conflicting with FK reads.
    await tx.$queryRaw `SELECT "id" FROM "user" WHERE "id" IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY "id" FOR NO KEY UPDATE`;
}
export async function lockInvitationRows(tx: Prisma.TransactionClient, ids: string[]) {
    if (ids.length)
        await tx.$queryRaw `SELECT "id" FROM "RelationshipInvite" WHERE "id" IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY "id" FOR UPDATE`;
}
export function invitationBlockBetween(tx: Prisma.TransactionClient, a: string, b: string) {
    return tx.invitationBlock.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }, select: { id: true } });
}
export function activeDeclinePause(tx: Prisma.TransactionClient, inviterId: string, to: {
    id?: string;
    email: string;
}) {
    return tx.relationshipInvite.findFirst({ where: { inviterId, declinedAt: { gt: new Date(Date.now() - DECLINE_PAUSE_MS) },
            OR: [...(to.id ? [{ inviteeId: to.id }] : []), { inviteeEmail: { equals: to.email, mode: "insensitive" } }],
        }, select: { id: true } });
}
export const invitationPairWhere = (a: InvitationUser, b: InvitationUser): Prisma.RelationshipInviteWhereInput => ({ OR: [
        { inviterId: a.id, OR: [{ inviteeId: b.id }, { inviteeEmail: { equals: b.email, mode: "insensitive" } }] },
        { inviterId: b.id, OR: [{ inviteeId: a.id }, { inviteeEmail: { equals: a.email, mode: "insensitive" } }] },
    ] });
