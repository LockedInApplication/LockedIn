import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { notificationCopy } from "./notification.catalog.js";
export type NotificationTx = Prisma.TransactionClient;
// Intentionally select only metadata. Private content is not needed for event derivation.
export function notificationSnapshot(tx: NotificationTx, id: string) {
    return tx.relationship.findUnique({ where: { id }, select: { id: true, status: true, members: { select: { userId: true } },
            conversationChoices: { select: { id: true, userId: true, packKey: true } },
            intentionSessions: { where: { status: { not: "ARCHIVED" } }, select: { id: true, status: true, responses: { select: { userId: true, revealConsentedAt: true } }, nextSteps: { select: { id: true, status: true, proposedById: true, reflections: { select: { userId: true } } } } } },
            meaningChapters: { select: { id: true, wordKey: true, status: true, candidateVersion: true, responses: { select: { id: true, userId: true, heardStatus: true } }, proposals: { select: { userId: true, kind: true } }, selections: { select: { userId: true } }, finalApprovals: { select: { userId: true, candidateVersion: true } } } },
        } });
}
export const eligibleNotifications = (userId: string) => ({ recipientId: userId, relationship: { status: "ACTIVE" as const, members: { some: { userId } } } });
export async function listNotifications(userId: string, before?: bigint) {
    const where = eligibleNotifications(userId);
    const [rows, unreadCount] = await prisma.$transaction([
        prisma.notification.findMany({ where: { ...where, ...(before ? { id: { lt: before } } : {}) }, orderBy: { id: "desc" }, take: 31 }),
        prisma.notification.count({ where: { ...where, readAt: null, resolvedAt: null } }),
    ]);
    const page = rows.slice(0, 30);
    return { items: page.map(row => ({ id: String(row.id), kind: row.kind, entityId: row.entityId, wordKey: row.wordKey,
            ...notificationCopy(row.kind), createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null, resolvedAt: row.resolvedAt?.toISOString() ?? null })),
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
    const result = await prisma.notification.aggregate({ where: eligibleNotifications(userId), _count: true, _max: { id: true, updatedAt: true } });
    return `${result._count}:${result._max.id ?? 0}:${result._max.updatedAt?.toISOString() ?? ""}`;
}
