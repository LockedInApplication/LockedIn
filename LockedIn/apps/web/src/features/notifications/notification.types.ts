export type NotificationItem = {
    invitationStatus?:string|null;
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
