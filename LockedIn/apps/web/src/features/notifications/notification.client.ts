import { journeyRequest } from "@/features/journey/journey.client";
import type { NotificationInbox } from "./notification.types";
export function fetchNotifications(signal: AbortSignal, before?: string) {
    return journeyRequest<NotificationInbox>(`/api/journey/notifications${before ? `?before=${encodeURIComponent(before)}` : ""}`, { signal, cache: "no-store" });
}
export function readNotification(id: string, signal: AbortSignal) {
    return journeyRequest(`/api/journey/notifications/${encodeURIComponent(id)}/read`, { method: "PUT", signal });
}
