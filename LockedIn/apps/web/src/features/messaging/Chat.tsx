"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { JourneyApiError } from "@/features/journey/journey.client";
import { ChatSession, mergeLatestMessages, prependMessages, type ChatMessage as Message, type ChatPage as Page } from "./chat-state";
import { messagingRequest, type ChatRequest } from "./messaging.client";
import { useChatRefresh } from "./use-chat-refresh";
import MessageSafetyActions from "./MessageSafetyActions";
import MessageActions from "./MessageActions";
import type { ChatPartner } from "./messaging.types";
import styles from "./chat.module.scss";
import chatStyles from "./chat.module.scss";

type ChatProps = { conversationId: string; userId: string; partner: ChatPartner; onAccessEnded: () => void; openingContext?: ReactNode; profileAction?: ReactNode; busy?: boolean; ariaLabel?: string; request?: ChatRequest; messagesPath?: string; renderReport?: (message: Message, onBlocked: () => void) => ReactNode };
export default function Chat(props: ChatProps) {
  return <ChatBody key={props.userId + ":" + props.conversationId} {...props}/>;
}

export function ChatTranscript({items, partnerName, busy, onReport, openingContext}: {items: Message[]; partnerName: string; busy: boolean; onReport: (message: Message) => void; openingContext?: ReactNode}) {
  return <>{openingContext}{items.length ? <ol className={chatStyles.messages} role="log" aria-label="Conversation messages" aria-relevant="additions">{items.map(message => <li key={message.id} data-message-id={message.id} className={message.author === "self" ? chatStyles.mine : undefined}>
    <div className={chatStyles.messageMeta}><strong>{message.author === "self" ? "You" : partnerName}</strong>
    {message.author === "partner" ? <MessageActions busy={busy} onReport={() => onReport(message)}/> : null}</div>
    <p>{message.text}</p><time className={chatStyles.timestamp} dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</time>
  </li>)}</ol> : <p>Send a message to keep the conversation going.</p>}</>;
}

const accessEnded = (error: unknown) => error instanceof JourneyApiError && [401, 403, 404].includes(error.status);

function ChatBody({ conversationId, userId, partner, onAccessEnded, openingContext, profileAction, busy = false, ariaLabel = "Chat", request = messagingRequest, messagesPath, renderReport }: ChatProps) {
  const path = messagesPath ?? `/api/messaging/conversations/${conversationId}/messages`;
  const [page, setPage] = useState<Page | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [closed, setClosed] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [actionError, setActionError] = useState("");
  const [report, setReport] = useState<Message | null>(null);
  const refresh = useRef<(() => void) | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const ended = useRef(false);
  const session = useRef<ChatSession | null>(null);
  const sendLock = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const lastMessage = useRef<string | undefined>(undefined);
  const [newMessages, setNewMessages] = useState(false);
  const reportClose = useRef<HTMLButtonElement>(null);
  const reportOrigin = useRef<HTMLElement | null>(null);
  const hasPage = page !== null;

  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (followLatest.current) node.scrollTop = node.scrollHeight; });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasPage]);

  useLayoutEffect(() => {
    if (report) { reportOrigin.current = document.activeElement as HTMLElement | null; reportClose.current?.focus(); }
  }, [report]);

  const rememberPosition = useCallback(() => {
    const node = viewport.current;
    if (!node || followLatest.current) { anchor.current = null; return; }
    const top = node.getBoundingClientRect().top;
    const visible = Array.from(node.querySelectorAll<HTMLElement>('[data-message-id]')).find(item => item.getBoundingClientRect().bottom > top);
    anchor.current = visible ? { id: visible.dataset.messageId!, offset: visible.getBoundingClientRect().top - top } : null;
  }, []);

  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (followLatest.current) node.scrollTop = node.scrollHeight;
    else if (anchor.current) {
      const saved = anchor.current;
      const item = Array.from(node.querySelectorAll<HTMLElement>('[data-message-id]')).find(item => item.dataset.messageId === saved.id);
      if (item) node.scrollTop += item.getBoundingClientRect().top - node.getBoundingClientRect().top - saved.offset;
    }
    anchor.current = null;
  }, [page]);

  const hideChat = useCallback(() => {
    ended.current = true;
    setClosed(true);
    setPage(null);
    setDraft("");
    setReport(null);
  }, []);

  useEffect(() => {
    const currentSession = new ChatSession(userId, conversationId, request, path);
    session.current = currentSession;
    const controller = currentSession.controller;
    lifecycle.current = controller;
    const { signal } = controller;
    let running = false;
    let queued = false;
    const load = async () => {
      if (signal.aborted || ended.current) return;
      if (running) { queued = true; return; }
      running = true;
      try {
        const latest = await currentSession.load();
        if (!signal.aborted && !ended.current) {
          rememberPosition();
          const latestId = latest.items.at(-1)?.id;
          if (!followLatest.current && lastMessage.current && latestId !== lastMessage.current) setNewMessages(true);
          lastMessage.current = latestId;
          setPage(previous => mergeLatestMessages(previous, latest));
          setSyncError("");
        }
      } catch (error) {
        if (signal.aborted || ended.current) return;
        if (accessEnded(error)) hideChat();
        else setSyncError("Could not refresh messages. Try again.");
      } finally {
        running = false;
        if (queued) { queued = false; void load(); }
      }
    };
    const sync = () => { if (document.visibilityState === "visible") void load(); };
    refresh.current = sync;

    return () => {
      currentSession.close();
      session.current = null;
      lifecycle.current = null;
      refresh.current = null;

    };
  }, [path, userId, conversationId, request, hideChat, rememberPosition]);

  const sync = useCallback(() => refresh.current?.(), []);
  useChatRefresh({userId,onRefresh:sync});

  async function send() {
    const text = draft.trim(), signal = lifecycle.current?.signal;
    if (!text || busy || sendLock.current || ended.current || !signal) return;
    sendLock.current = true;
    setSending(true);
    setActionError("");
    try {
      await session.current!.send(text);
      if (signal.aborted || ended.current) return;
      followLatest.current = true;
      setNewMessages(false);
      setDraft("");
      refresh.current?.();
    } catch (error) {
      if (signal.aborted || ended.current) return;
      if (accessEnded(error)) hideChat();
      else setActionError(error instanceof Error ? error.message : "Could not send this message.");
    } finally {
      sendLock.current = false;
      if (!signal.aborted) setSending(false);
    }
  }

  async function loadOlder() {
    const cursor = page?.nextCursor, signal = lifecycle.current?.signal;
    if (!cursor || !signal || loadingOlder || ended.current) return;
    setLoadingOlder(true);
    setActionError("");
    try {
      const older = await session.current!.load(cursor);
      if (!signal.aborted && !ended.current) {
        rememberPosition();
        setPage(current => current?.nextCursor === cursor
          ? prependMessages(current, older)
          : current);
      }
    } catch (error) {
      if (signal.aborted || ended.current) return;
      if (accessEnded(error)) hideChat();
      else setActionError("Could not load older messages. Try again.");
    } finally {
      if (!signal.aborted) setLoadingOlder(false);
    }
  }

  return <section className={`${styles.card} ${chatStyles.chat}`} aria-label={ariaLabel}>
    <h2>Messages</h2>{profileAction}
    {closed ? <p role="status">This chat is no longer available.</p> : <>
      <p className={styles.muted}>You’re connected. Reported messages can be reviewed by moderators.</p>
      {!page && !syncError ? <p role="status">Loading messages…</p> : null}
      {syncError ? <p role="alert">{syncError} <button type="button" onClick={() => refresh.current?.()}>Retry</button></p> : null}
      {page ? <div ref={viewport} className={chatStyles.viewport} role="region" aria-label="Scrollable conversation" tabIndex={0}
        onScroll={event => { const node = event.currentTarget; followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64; if (followLatest.current) setNewMessages(false); }}>
      {page?.nextCursor ? <button type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading…" : "Load older messages"}</button> : null}
      <ChatTranscript items={page.items} partnerName={partner.publicName} busy={busy} onReport={setReport} openingContext={openingContext}/>
      </div> : null}
      {newMessages ? <button className={chatStyles.newMessages} type="button" onClick={() => { followLatest.current = true; setNewMessages(false); if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; }}>New messages · Jump to latest ↓</button> : null}
      {report ? <div role="region" aria-label="Report selected message">
        <button ref={reportClose} type="button" onClick={() => { setReport(null); reportOrigin.current?.focus(); }}>Close message report</button>
        {renderReport ? renderReport(report, () => { hideChat(); onAccessEnded(); }) : <MessageSafetyActions key={report.id} userId={userId} conversationId={conversationId} message={report} onBlocked={() => { hideChat(); onAccessEnded(); }}/>}
      </div> : null}
      {page ? <form className={`${styles.form} ${chatStyles.composer}`} onSubmit={event => { event.preventDefault(); void send(); }}>
        <label>Message<textarea rows={2} maxLength={2000} value={draft} disabled={sending || busy} placeholder="Write a message…" onChange={event => setDraft(event.target.value)}/></label>
        <button className={styles.primary} type="submit" disabled={!draft.trim() || sending || busy}>{sending ? "Sending…" : "Send message"}</button>
        <p className={styles.muted}>Up to 2,000 characters. Unsent messages aren’t saved when you leave.</p>
      </form> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
    </>}
  </section>;
}

