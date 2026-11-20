import { messagingRequest } from "../messaging/messaging.client";
import type { UnreadChats } from "./notification.types";

export const unreadChatsEvent = "lockedin-unread-chats";
export function fetchUnreadChats(userId: string, signal: AbortSignal): Promise<UnreadChats> {
    return messagingRequest(userId, "/api/messaging/unread?presentation=sheet", { signal });
}

export function signalUnreadChats(userId: string) {
    window.dispatchEvent(new CustomEvent(unreadChatsEvent, { detail: userId }));
}
