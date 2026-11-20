import type { NotificationItem } from "./notification.types";
export function notificationDestination(item: Pick<NotificationItem, "view" | "entityId" | "wordKey"> & {id?:string}) {
    const query = new URLSearchParams();
    if(item.view==="discovery")return `/connections/${encodeURIComponent(item.entityId)}`;
    if(item.view==="messages")return `/messages/${encodeURIComponent(item.entityId)}`;
    if(item.view==="invitations")return `/journey?invitation=${encodeURIComponent(item.entityId)}`;
    if (item.view === "atlas") {
        query.set("view", "atlas");
        query.set("chapter", item.entityId);
        if (item.wordKey)
            query.set("word", item.wordKey);
    }
    else if (item.view === "roadmap")
        return `/journey?view=roadmap#step-${encodeURIComponent(item.entityId)}`;
    else if (item.view === "conversations") {
        query.set("view", "conversations");
        if(item.id)query.set("suggestion",item.id);
    }
    else
        return "/journey";
    return `/journey?${query}`;
}
