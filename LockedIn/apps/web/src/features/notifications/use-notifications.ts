"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, JourneyApiError } from "@/features/journey/journey.client";
import { fetchNotifications, readNotification } from "./notification.client";
import type { ConnectionState, NotificationInbox, UnreadChats } from "./notification.types";
import { fetchUnreadChats, unreadChatsEvent } from "./message-alerts.client";
import { signalChatRefresh } from "../messaging/use-chat-refresh";
export function useNotifications(userId: string, onActivity: () => void, onExpired: () => void,onStatusChange?:(activity?:boolean)=>void,onChatSync?:()=>void) {
    const [inbox, setInbox] = useState<NotificationInbox>({ items: [], unreadCount: 0, nextCursor: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connection, setConnection] = useState<ConnectionState>("connecting");
    const [chatInbox,setChatInbox] = useState<{ owner: string; data: UnreadChats; announcement: string } | null>(null);
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
        let fetchingChats = false, pendingChats = false;
        const refreshChats = async () => {
            if (abort.signal.aborted) return;
            if (fetchingChats) { pendingChats = true; return; }
            fetchingChats = true;
            try {
                const data = await fetchUnreadChats(userId, abort.signal);
                if (abort.signal.aborted) return;
                setChatInbox(previous => {
                    const known = previous?.owner === userId ? new Set(previous.data.items.map(item => item.conversationId)) : null;
                    const newChats = known ? data.items.filter(item => !known.has(item.conversationId)).length : 0;
                    const knownDates = previous?.owner === userId ? new Set(previous.data.dates?.items.map(item => item.planId)) : null;
                    const newDate = knownDates && data.dates?.items.some(item => !knownDates.has(item.planId));
                    return { owner:userId, data, announcement:newChats ? `New messages in ${data.count > 99 ? "99+" : data.count} ${data.count === 1 ? "conversation" : "conversations"}` : newDate ? "New date update" : "" };
                });
            } catch { /* Other notifications remain usable; reconnect or poll can recover. */ }
            finally {
                fetchingChats = false;
                if (pendingChats) { pendingChats = false; void refreshChats(); }
            }
        };
        void load();
        void refreshChats();
        const stream = new EventSource(`${API_URL}/api/journey/notifications/stream`, { withCredentials: true });
        source.current = stream;
        stream.onopen = () => { if (!abort.signal.aborted) {
            setConnection("live"); signalChatRefresh(userId); onChatSync?.(); void refreshChats();
        } };
        stream.addEventListener("discovery-chat-changed", () => { if (!abort.signal.aborted) { signalChatRefresh(userId); onChatSync?.(); void refreshChats(); } });
        stream.addEventListener("unread-chats-changed", () => void refreshChats());
        stream.addEventListener("notifications-changed", event => {
            if (abort.signal.aborted)
                return;
            void load();
            void refreshChats();
            signalChatRefresh(userId);
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
            return; setConnection("reconnecting"); void load(); void refreshChats(); };
        // Recover the inbox even if a proxy or another tab exhausts the stream limit.
        const timer = setInterval(() => { if (document.visibilityState === "visible") { void load(); void refreshChats(); } }, 30000);
        const focus = () => { void load(); void refreshChats(); };
        const unreadChanged = (event: Event) => { if ((event as CustomEvent<string>).detail === userId) void refreshChats(); };
        window.addEventListener("focus", focus);
        window.addEventListener(unreadChatsEvent, unreadChanged);
        return () => { abort.abort(); stream.close(); clearInterval(timer); window.removeEventListener("focus", focus); window.removeEventListener(unreadChatsEvent,unreadChanged); controller.current = null; source.current = null; };
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
    const chat = chatInbox?.owner === userId ? chatInbox : null;
    return { ...inbox, loading, error, connection, retry: () => void load(), more: () => void load(inbox.nextCursor ?? undefined), markRead,
        unreadChatCount:chat?.data.count ?? 0, unreadChats:chat?.data.items ?? [], chatAnnouncement:chat?.announcement ?? "",
        unreadDateCount: chat?.data.dates?.count ?? 0, unreadDates: chat?.data.dates?.items ?? [] };
}
