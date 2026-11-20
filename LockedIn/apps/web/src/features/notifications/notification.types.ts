export type NotificationItem = {
    invitationStatus?:string|null;
    planId?: string;
    id: string;
    kind: string;
    entityId: string;
    wordKey: string | null;
    view: string;
    title: string;
    message: string;
    createdAt: string;
    readAt: string | null;
    resolvedAt: string | null;
};
export type NotificationInbox = {
    items: NotificationItem[];
    unreadCount: number;
    nextCursor: string | null;
};
export type ConnectionState = "connecting" | "live" | "reconnecting";
export type UnreadChat = { conversationId: string; discoveryConnectionId: string | null };
export type UnreadDate = UnreadChat & { planId: string };
export type UnreadChats = { count: number; items: UnreadChat[]; dates?: { count: number; items: UnreadDate[] } };
