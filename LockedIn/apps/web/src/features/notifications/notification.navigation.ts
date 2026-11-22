import type { NotificationItem } from "./notification.types";
import { currentCheckInHref } from "@/features/journey/journey.navigation";
export function notificationDestination(item: Pick<NotificationItem, "view" | "entityId" | "wordKey" | "planId"> & {id?:string;kind?:string}) {
    const query = new URLSearchParams();
    if(item.view==="discovery" || item.view==="messages") {
        if (item.planId) query.set("date", item.planId);
        return `/${item.view === "discovery" ? "connections" : "messages"}/${encodeURIComponent(item.entityId)}${query.size ? "?" + query : ""}`;
    }
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
    else {
        if (item.view === "home" && ["CONVERSATION_READY", "SHARING_READY", "GROUND_READY"].includes(item.kind ?? "")) return currentCheckInHref;
        return "/journey";
    }
    return `/journey?${query}`;
}
