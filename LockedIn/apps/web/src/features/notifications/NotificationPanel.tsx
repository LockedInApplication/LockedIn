import type { ConnectionState, NotificationItem, UnreadChat } from "./notification.types";
import inboxStyles from "./notification.module.scss";
type Props = {
    items: NotificationItem[];
    loading: boolean;
    error: string | null;
    connection: ConnectionState;
    nextCursor: string | null;
    onRetry: () => void;
    onMore: () => void;
    onOpen: (item: NotificationItem) => void;
    onClose: () => void;
    unreadChats?: UnreadChat[];
    onOpenChat?: (item: UnreadChat) => void;
};
export default function NotificationPanel({ items, loading, error, connection, nextCursor, onRetry, onMore, onOpen, onClose, unreadChats = [], onOpenChat }: Props) {
    const chats = [...new Map(unreadChats.map(chat => [chat.conversationId,chat])).values()];
    return <section className={inboxStyles.panel} aria-label="Notifications">
    <header className={inboxStyles.panelHeader}>
      <div><span className={inboxStyles.kicker}>A LITTLE HEADS-UP</span><h2>Your updates</h2></div>
      <button type="button" onClick={onClose} aria-label="Close notifications" className={inboxStyles.close}>×</button>
    </header>
    {connection === "reconnecting" ? <p className={inboxStyles.connection} role="status">Reconnecting… Your saved updates are still here.</p> : null}
    {error ? <div className={inboxStyles.connection} role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Try again</button></div> : null}
    {loading && !items.length && !chats.length ? <p role="status" className={inboxStyles.empty}>Gathering your updates…</p> : null}
    {!loading && !error && !items.length && !chats.length ? <div className={inboxStyles.empty}><span aria-hidden>✦</span><h3>You’re all caught up</h3><p>We’ll let you know when there’s something new to explore.</p></div> : null}
    {chats.length ? <ul className={inboxStyles.list} aria-label="Unread conversations">{chats.map(chat => <li key={chat.conversationId} className={`${inboxStyles.item} ${inboxStyles.unread}`}>
      <span className={inboxStyles.itemIcon} aria-hidden>✦</span><div><h3>New message</h3><button type="button" className={inboxStyles.openActivity} onClick={() => onOpenChat?.(chat)}>Open chat <span aria-hidden>↗</span></button></div>
    </li>)}</ul> : null}
    <ul className={inboxStyles.list}>{items.map(item => <li key={item.id} className={`${inboxStyles.item} ${!item.readAt && !item.resolvedAt ? inboxStyles.unread : ""}`}>
      <span className={inboxStyles.itemIcon} aria-hidden>{item.resolvedAt ? "✓" : "✦"}</span>
      <div><h3>{item.title}</h3><p>{item.message}</p>
        <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
        {item.resolvedAt ? <span className={inboxStyles.completed}>{item.invitationStatus?`Invitation ${item.invitationStatus.toLowerCase()}`:"Already completed or updated"}</span>:null}
        {!item.resolvedAt || item.kind==="INVITATION_RECEIVED"?<button type="button" className={inboxStyles.openActivity} onClick={() => onOpen(item)}>{item.kind==="INVITATION_RECEIVED"?"Review invitation":"Open activity"} <span aria-hidden>↗</span></button>:null}
      </div>
    </li>)}</ul>
    {nextCursor ? <button className={inboxStyles.more} type="button" onClick={onMore} disabled={loading}>{loading ? "Loading…" : "Earlier updates"}</button> : null}
  </section>;
}
