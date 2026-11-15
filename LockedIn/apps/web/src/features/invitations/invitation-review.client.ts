import { journeyRequest } from "@/features/journey/journey.client";
import type { InvitationReviewData,InvitationDecision } from "./invitation-review.types";
export function fetchInvitationReview(reference: string, by: "id" | "token", signal: AbortSignal) {
    return journeyRequest<InvitationReviewData>(`/api/journey/invites/${encodeURIComponent(reference)}/review${by === "id" ? "?by=id" : ""}`, { signal, cache: "no-store" });
}
export function respondToInvitation(token: string, decision: InvitationDecision, signal: AbortSignal) {
    return journeyRequest(`/api/journey/invites/${encodeURIComponent(token)}/${decision}`, { method: "POST", signal });
}
