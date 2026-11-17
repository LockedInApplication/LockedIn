"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, JourneyApiError } from "@/features/journey/journey.client";
import { fetchNotifications, readNotification } from "./notification.client";
import type { ConnectionState, NotificationInbox } from "./notification.types";
export function useNotifications(userId: string, onActivity: () => void, onExpired: () => void,onStatusChange?:(activity?:boolean)=>void,onChatSync?:()=>void) {
    const [inbox, setInbox] = useState<NotificationInbox>({ items: [], unreadCount: 0, nextCursor: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connection, setConnection] = useState<ConnectionState>("connecting");
    const controller = useRef<AbortController | null>(null);
    const latestRequest = useRef(0);
    const source = useRef<EventSource | null>(null);
    const load = useCallback(async (before?: string) => {
        const signal = controller.current?.signal;
        if (!signal || signal.aborted)
            return;
        const request = ++latestRequest.current;
        setLoading(true);
        try {
            const data = await fetchNotifications(signal, before);
            if (signal.aborted || request !== latestRequest.current)
                return;
            setInbox(old => before ? { ...data, items: [...old.items, ...data.items.filter(item => !old.items.some(prev => prev.id === item.id))] } : data);
            setError(null);
        }
        catch (e) {
            if (signal.aborted || request !== latestRequest.current)
                return;
            if (e instanceof JourneyApiError && e.status === 401) {
                source.current?.close();
                onExpired();
                return;
            }
            setError("Your updates could not load. Please try again.");
        }
        finally {
            if (!signal.aborted && request === latestRequest.current)
                setLoading(false);
        }
    }, [onExpired]);
    useEffect(() => {
        const abort = new AbortController();
        controller.current = abort;
        void load();
        const stream = new EventSource(`${API_URL}/api/journey/notifications/stream`, { withCredentials: true });
        source.current = stream;
        stream.onopen = () => { if (!abort.signal.aborted) {
            setConnection("live"); onChatSync?.();
        } };
        stream.addEventListener("discovery-chat-changed", () => { if (!abort.signal.aborted) onChatSync?.(); });
        stream.addEventListener("notifications-changed", event => {
            if (abort.signal.aborted)
                return;
            void load();
            onChatSync?.();
            try {
                const activity=JSON.parse((event as MessageEvent).data).activity===true;
                onStatusChange?.(activity);
                if (activity)
                    onActivity();
            }
            catch { /* Never trust stream data as domain content. */ }
        });
        stream.addEventListener("auth-expired", () => { stream.close(); if (!abort.signal.aborted)
            onExpired(); });
        stream.onerror = () => { if (abort.signal.aborted)
            return; setConnection("reconnecting"); void load(); };
        // Recover the inbox even if a proxy or another tab exhausts the stream limit.
        const timer = setInterval(() => { if (document.visibilityState === "visible")
            void load(); }, 30000);
        const focus = () => { void load(); };
        window.addEventListener("focus", focus);
        return () => { abort.abort(); stream.close(); clearInterval(timer); window.removeEventListener("focus", focus); controller.current = null; source.current = null; };
    }, [userId, load, onActivity, onExpired,onStatusChange,onChatSync]);
    const markRead = async (id: string) => {
        const signal = controller.current?.signal;
        if (!signal)
            return;
        try {
            await readNotification(id, signal);
            await load();
        }
        catch (e) {
            if (signal.aborted)
                return;
            if (e instanceof JourneyApiError && e.status === 401)
                onExpired();
            else
                setError("We couldn’t mark this update as read. Try again.");
        }
    };
    return { ...inbox, loading, error, connection, retry: () => void load(), more: () => void load(inbox.nextCursor ?? undefined), markRead };
}
