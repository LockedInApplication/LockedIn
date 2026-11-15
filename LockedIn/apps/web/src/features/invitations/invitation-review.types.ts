export type InvitationReviewData = {
    canBlock?:boolean;
    id: string;
    token: string;
    inviterName: string;
    status: string;
    expiresAt: string | null;
    canRespond: boolean;
    blockedReason: string | null;
};
export type InvitationDecision="accept"|"decline"|"block";
