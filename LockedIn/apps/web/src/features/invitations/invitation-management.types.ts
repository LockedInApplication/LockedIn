export type SentInvitation = {
    id: string;
    toEmail: string;
    status: "PENDING" | "ACCEPTED" | "NOT_ACCEPTED" | "EXPIRED" | "WITHDRAWN";
    createdAt: string;
    expiresAt: string | null;
    canWithdraw: boolean;
};
export type OwnedInvitationBlock = {
    id: string;
    name: string;
    createdAt: string;
};
export type InvitationPage<T> = {
    items: T[];
    nextCursor: string | null;
};
