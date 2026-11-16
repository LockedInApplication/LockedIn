import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { notificationCopy } from "./notification.catalog.js";
import { createHash } from "node:crypto";
export type NotificationTx = Prisma.TransactionClient;
// Intentionally select only metadata. Private content is not needed for event derivation.
export function notificationSnapshot(tx: NotificationTx, id: string) {
    return tx.relationship.findUnique({ where: { id }, select: { id: true, status: true, members: { select: { userId: true } },
            conversationChoices: { select: { id: true, userId: true, packKey: true } },
            intentionSessions: { where: { status: { not: "ARCHIVED" } }, select: { id: true, status: true, responses: { select: { userId: true, revealConsentedAt: true } }, nextSteps: { select: { id: true, status: true, proposedById: true, reflections: { select: { userId: true } } } } } },
            meaningChapters: { select: { id: true, wordKey: true, status: true, candidateVersion: true, responses: { select: { id: true, userId: true, heardStatus: true } }, proposals: { select: { userId: true, kind: true } }, selections: { select: { userId: true } }, finalApprovals: { select: { userId: true, candidateVersion: true } } } },
        } });
}
export const eligibleNotifications = (userId: string):Prisma.NotificationWhereInput => ({recipientId:userId,suppressed:false,OR:[
    {relationship:{status:"ACTIVE",members:{some:{userId}}}},
    {kind:"INVITATION_RECEIVED",invitation:{inviteeId:userId}},
    {discoveryConnection:{OR:[{userLowId:userId},{userHighId:userId}]}},
]});
function unreadNotifications(userId:string):Prisma.NotificationWhereInput {
    return {...eligibleNotifications(userId),readAt:null,resolvedAt:null,AND:[{OR:[
        {invitationId:null},{invitation:{status:"PENDING",expiresAt:{gt:new Date()}}},
    ]},{OR:[{discoveryConnectionId:null},{discoveryConnection:{OR:[{state:{in:["ACCEPTED","PROMOTED"]}},{state:"PENDING",expiresAt:{gt:new Date()}}]}}]}]};
}
export async function listNotifications(userId: string, before?: bigint) {
    const where = eligibleNotifications(userId);
    const [rows, unreadCount] = await prisma.$transaction([
        prisma.notification.findMany({ where: { ...where, ...(before ? { id: { lt: before } } : {}) }, orderBy: { id: "desc" }, take: 31,include:{invitation:{select:{status:true,expiresAt:true,updatedAt:true,inviter:{select:{name:true,displayName:true}}}},discoveryConnection:{select:{state:true,expiresAt:true,updatedAt:true}}} }),
        prisma.notification.count({ where: unreadNotifications(userId) }),
    ]);
    const page = rows.slice(0, 30);
    return { items: page.map(row => {
        const invite=row.invitation;
        const invitationStatus=invite?.status==="PENDING" && (!invite.expiresAt || invite.expiresAt<=new Date())?"EXPIRED":invite?.status??null;
        const discovery=row.discoveryConnection;
        const discoveryResolved=discovery && (!["PENDING","ACCEPTED","PROMOTED"].includes(discovery.state) || (discovery.state==="PENDING" && discovery.expiresAt<=new Date()));
        const resolvedAt=row.resolvedAt??(discoveryResolved?discovery.updatedAt:null)??(invite && invitationStatus!=="PENDING"?(invitationStatus==="EXPIRED"?invite.expiresAt??invite.updatedAt:invite.updatedAt):null);
        const copy=notificationCopy(row.kind);
        return { id: String(row.id), kind: row.kind, entityId: row.entityId, wordKey: row.wordKey,
            ...copy,...(invite?{message:`${invite.inviter.displayName??invite.inviter.name??"Someone"} invited you. Connecting does not reveal any answers.`}:{}),
            invitationStatus,createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null, resolvedAt: resolvedAt?.toISOString() ?? null };
        }),
        unreadCount, nextCursor: rows.length > 30 ? String(page.at(-1)!.id) : null };
}
export async function markNotificationRead(userId: string, id: bigint) {
    const where = { ...eligibleNotifications(userId), id };
    const exists = await prisma.notification.findFirst({ where, select: { id: true } });
    if (!exists)
        return false;
    await prisma.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
    return true;
}
export async function notificationFingerprint(userId: string) {
    const [result,unread,connections,profile]=await prisma.$transaction([
        prisma.notification.aggregate({ where: eligibleNotifications(userId), _count: true, _max: { id: true, updatedAt: true } }),
        prisma.notification.count({where:unreadNotifications(userId)}),
        prisma.discoveryConnection.findMany({where:{OR:[{userLowId:userId},{userHighId:userId}]},orderBy:{id:"asc"},select:{id:true,state:true,expiresAt:true,updatedAt:true,consentVersion:true,lowReadinessVersion:true,highReadinessVersion:true}}),
        prisma.discoveryProfile.findUnique({where:{ownerId:userId},select:{publicationVersion:true,pausedAt:true,suspendedAt:true}}),
    ]);
    const metadata=createHash("sha256").update(JSON.stringify({connections,profile})).digest("hex");
    return `${result._count}:${result._max.id ?? 0}:${result._max.updatedAt?.toISOString() ?? ""}:${unread}:${metadata}`;
}
