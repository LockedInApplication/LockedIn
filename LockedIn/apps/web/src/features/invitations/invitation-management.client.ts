import { journeyRequest } from "@/features/journey/journey.client";
import type { InvitationPage } from "./invitation-management.types";
export function fetchInvitationPage<T>(path: string, signal: AbortSignal, before?: string) {
    return journeyRequest<InvitationPage<T>>(`${path}${before ? `?before=${encodeURIComponent(before)}` : ""}`, { signal, cache: "no-store" });
}
export function updateInvitationSetting(path: string, method: "POST" | "DELETE", signal: AbortSignal) {
    return journeyRequest(path, { method, signal });
}
