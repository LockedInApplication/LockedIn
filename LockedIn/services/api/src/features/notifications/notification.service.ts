import { prisma } from "../../lib/prisma.js";
import { notificationSnapshot, type NotificationTx } from "./notification.repository.js";
import { deriveTasks, taskDelta, type NotificationTask } from "./notification.tasks.js";
import { notificationBroker } from "./notification.broker.js";
import { inAppActivityAllowed } from "./notification-preferences.js";
export function inTransaction<T>(tx: NotificationTx | undefined, work: (tx: NotificationTx) => Promise<T>): Promise<T> {
    return tx ? work(tx) : prisma.$transaction(work);
}
export async function persistTask(tx: NotificationTx, task: NotificationTask) {
    const previous=await tx.notification.findFirst({where:{recipientId:task.recipientId,...taskKeyFilter(task.eventKey)},orderBy:{id:"desc"}});
    if(previous && !previous.resolvedAt)return;
    // A resolved task becoming actionable again is a new occurrence, not a read reset
    // on an old row. Its committed predecessor ID makes retries stable under the lock.
    const suppressed = !await inAppActivityAllowed(tx,task.recipientId);
    await tx.notification.create({data:{...task,suppressed,eventKey:previous?`${task.eventKey}::${previous.id}`:task.eventKey}});
}
function taskKeyFilter(eventKey:string) {
    return {OR:[{eventKey},{eventKey:{startsWith:`${eventKey}::`}}]};
}
export async function withNotifications<T>(relationshipId: string, actorId: string, work: (tx: NotificationTx) => Promise<T>): Promise<T> {
    const recipients = new Set<string>();
    const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT "id" FROM "Relationship" WHERE "id" = ${relationshipId} FOR UPDATE`;
        const before = await notificationSnapshot(tx, relationshipId);
        if (!before || before.status !== "ACTIVE" || !before.members.some(m => m.userId === actorId))
            throw new Error("This shared space is no longer available.");
        const value = await work(tx);
        const after = await notificationSnapshot(tx, relationshipId);
        const delta = taskDelta(deriveTasks(before), after ? deriveTasks(after) : []);
        for (const task of delta.resolved) {
            await tx.notification.updateMany({ where: { recipientId: task.recipientId, ...taskKeyFilter(task.eventKey), resolvedAt: null }, data: { resolvedAt: new Date() } });
            recipients.add(task.recipientId);
        }
        for (const task of delta.created) {
            await persistTask(tx, task);
            recipients.add(task.recipientId);
        }
        // Even changes with no new task may require an explicit overview refresh.
        for (const member of before.members)
            recipients.add(member.userId);
        return value;
    });
    for (const id of recipients)
        notificationBroker.publish(id, await inAppActivityAllowed(prisma,id));
    return result;
}
