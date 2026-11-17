"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JourneyApiError } from "@/features/journey/journey.client";
import { useDiscovery } from "./DiscoveryShell";
import DiscoverySafetyActions, { type DiscoveryReportSource } from "./DiscoverySafetyActions";
import ConversationOpening, { type ConversationOpener } from "./ConversationOpening";
import { discoveryRequest } from "./discovery.client";
import { mergeLatestMessages, type ChatMessage as Message, type ChatPage as Page } from "./discovery-chat";
import styles from "./discovery.module.scss";
import chatStyles from "./discovery-chat.module.scss";

const accessEnded = (error: unknown) => error instanceof JourneyApiError && [401, 403, 404].includes(error.status);

export default function DiscoveryChat({ connectionId, opening, onBlocked }: { connectionId: string; opening: ConversationOpener; onBlocked: () => void }) {
  const { userId, chatRevision, busy } = useDiscovery();
  const path = `/api/discovery/connections/${connectionId}/messages`;
  const [page, setPage] = useState<Page | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [closed, setClosed] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [actionError, setActionError] = useState("");
  const [report, setReport] = useState<DiscoveryReportSource | null>(null);
  const refresh = useRef<(() => void) | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const ended = useRef(false);
  const attempt = useRef<{ text: string; id: string } | null>(null);
  const sendLock = useRef(false);

  const hideChat = useCallback(() => {
    ended.current = true;
    setClosed(true);
    setPage(null);
    setDraft("");
    setReport(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    const { signal } = controller;
    let running = false;
    let queued = false;
    const load = async () => {
      if (signal.aborted || ended.current) return;
      if (running) { queued = true; return; }
      running = true;
      try {
        const latest = await discoveryRequest<Page>(userId, path, { signal });
        if (!signal.aborted && !ended.current) {
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
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    const timer = window.setInterval(sync, 15_000);
    return () => {
      controller.abort();
      lifecycle.current = null;
      refresh.current = null;
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", sync);
      window.clearInterval(timer);
    };
  }, [path, userId, hideChat]);

  useEffect(() => { refresh.current?.(); }, [chatRevision, path, userId]);

  async function send() {
    const text = draft.trim(), signal = lifecycle.current?.signal;
    if (!text || busy || sendLock.current || ended.current || !signal) return;
    sendLock.current = true;
    setSending(true);
    setActionError("");
    if (attempt.current?.text !== text) attempt.current = { text, id: crypto.randomUUID() };
    try {
      await discoveryRequest<Message>(userId, path, {
        method: "POST", signal, body: JSON.stringify({ text, requestId: attempt.current.id }),
      });
      if (signal.aborted || ended.current) return;
      attempt.current = null;
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
      const older = await discoveryRequest<Page>(userId, `${path}?before=${cursor}`, { signal });
      if (!signal.aborted && !ended.current) {
        setPage(current => current?.nextCursor === cursor
          ? { items: [...older.items, ...current.items], nextCursor: older.nextCursor }
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

  return <section className={styles.card} aria-label="Discovery chat">
    <h2>Messages</h2>
    {closed ? <p role="status">This chat is no longer available.</p> : <>
      <p className={styles.muted}>You’re connected. Continue from the opening reply below. Reported messages can be reviewed by moderators.</p>
      {!page && !syncError ? <p role="status">Loading messages…</p> : null}
      {syncError ? <p role="alert">{syncError} <button type="button" onClick={() => refresh.current?.()}>Retry</button></p> : null}
      {page ? <ConversationOpening opening={opening} busy={busy} onReport={() => setReport({ sourceType: "INVITATION", sourceId: connectionId, label: "Opening message", preview: opening.hello })}/> : null}
      {page?.nextCursor ? <button type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading…" : "Load older messages"}</button> : null}
      {page && !page.items.length ? <p>Connection accepted. Send a message to keep the conversation going.</p> : null}
      {page?.items.length ? <ol className={chatStyles.messages} role="log" aria-label="Conversation messages">{page.items.map(message => <li key={message.id} className={message.author === "self" ? chatStyles.mine : undefined}>
        <strong>{message.author === "self" ? "You" : "Your connection"}</strong>
        <p>{message.text}</p>
        {message.author === "partner" ? <button type="button" disabled={busy} onClick={() => setReport({ sourceType: "MESSAGE", sourceId: message.id, label: "Received message", preview: message.text })}>Report message</button> : null}
      </li>)}</ol> : null}
      {report ? <div>
        <button type="button" onClick={() => setReport(null)}>Close message report</button>
        <DiscoverySafetyActions key={report.sourceId} expanded connectionId={connectionId} reportSource={report} onBlocked={onBlocked}/>
      </div> : null}
      {page ? <form className={styles.form} onSubmit={event => { event.preventDefault(); void send(); }}>
        <label>Message<textarea maxLength={2000} value={draft} disabled={sending || busy} onChange={event => setDraft(event.target.value)}/></label>
        <p className={styles.muted}>Up to 2,000 characters. Unsent messages aren’t saved when you leave.</p>
        <button className={styles.primary} type="submit" disabled={!draft.trim() || sending || busy}>{sending ? "Sending…" : "Send message"}</button>
      </form> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
    </>}
  </section>;
}
