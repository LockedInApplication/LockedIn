export const DECLINE_PAUSE_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_UNAVAILABLE = "No new invitation can be sent to this address right now.";
export const invitationFailure = (status: number, error: string) => ({ ok: false as const, status, error });
export function declinePauseActive(declinedAt: Date | null, now = Date.now()) {
    return !!declinedAt && declinedAt.getTime() + DECLINE_PAUSE_MS > now;
}
export function senderInvitationStatus(invite: {
    status: string;
    expiresAt: Date | null;
}, now = Date.now()) {
    if (invite.status === "PENDING")
        return invite.expiresAt && invite.expiresAt.getTime() > now ? "PENDING" : "EXPIRED";
    if (invite.status === "ACCEPTED")
        return "ACCEPTED";
    if (invite.status === "CANCELED")
        return "WITHDRAWN";
    if (invite.status === "EXPIRED")
        return "EXPIRED";
    return "NOT_ACCEPTED";
}
