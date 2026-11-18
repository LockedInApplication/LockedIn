"use client";
import { useEffect } from "react";
export const chatRefreshEvent = "lockedin-chat-refresh";
export function signalChatRefresh(userId: string) {
  window.dispatchEvent(new CustomEvent(chatRefreshEvent,{ detail: { userId } }));
}
export function useChatRefresh({ userId, onRefresh }: { userId: string; onRefresh: () => void }) {
  useEffect(() => {
    const sync = () => { if (document.visibilityState === "visible") onRefresh(); };
    const event = (e: Event) => { if ((e as CustomEvent<{userId: string}>).detail?.userId === userId) sync(); };
    window.addEventListener(chatRefreshEvent,event);
    window.addEventListener("focus",sync); window.addEventListener("online",sync); document.addEventListener("visibilitychange",sync);
    const timer = window.setInterval(sync,15000); sync();
    return () => { window.clearInterval(timer); window.removeEventListener(chatRefreshEvent,event); window.removeEventListener("focus",sync); window.removeEventListener("online",sync); document.removeEventListener("visibilitychange",sync); };
  },[userId,onRefresh]);
}
