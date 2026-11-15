"use client";
import { useEffect, useRef, useState } from "react";
import { useNotifications } from "./use-notifications";
import NotificationPanel from "./NotificationPanel";
import type { NotificationItem } from "./notification.types";
import inboxStyles from "./notification.module.scss";
export default function NotificationBell({ userId, onOpen, onActivity, onExpired,onStatusChange }: {
    userId: string;
    onOpen: (item: NotificationItem) => Promise<boolean>;
    onActivity: () => void;
    onExpired: () => void;
    onStatusChange?:(activity?:boolean)=>void;
}) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const notifications = useNotifications(userId, onActivity, onExpired,onStatusChange);
    const close = () => { setOpen(false); button.current?.focus(); };
    useEffect(() => {
        if (!open)
            return;
        root.current?.querySelector<HTMLButtonElement>('[aria-label="Close notifications"]')?.focus();
        const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node))
            setOpen(false); };
        const escape = (e: KeyboardEvent) => { if (e.key === "Escape") {
            setOpen(false);
            button.current?.focus();
        } };
        document.addEventListener("pointerdown", outside);
        document.addEventListener("keydown", escape);
        return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
    }, [open]);
    return <div ref={root} className={inboxStyles.root} onBlurCapture={event=>{if(event.relatedTarget&&!root.current?.contains(event.relatedTarget as Node))setOpen(false);}}>
    <button ref={button} type="button" className={inboxStyles.bell} aria-label={`Notifications, ${notifications.unreadCount} unread`} aria-expanded={open} aria-controls="notification-inbox" onClick={() => setOpen(value => !value)}>
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M9 21h6"/></svg>
      {notifications.unreadCount > 0 ? <span className={inboxStyles.badge} aria-hidden>{notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}</span> : null}
    </button>
    <span className={inboxStyles.srOnly} role="status" aria-live="polite">{notifications.unreadCount ? `${notifications.unreadCount} unread updates` : ""}</span>
    {open ? <div id="notification-inbox"><NotificationPanel {...notifications} onClose={close} onRetry={notifications.retry} onMore={notifications.more} onOpen={async (item) => {
                if (await onOpen(item)) {
                    await notifications.markRead(item.id);
                    close();
                }
            }}/></div> : null}
  </div>;
}
