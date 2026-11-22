"use client";

import { Fragment, Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { JourneyApiError } from "@/features/journey/journey.client";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import { ChatSession, loadChatRefresh, mergeLatestMessages, prependMessages, readThroughSequence, type ChatMessage as Message, type ChatPage as Page } from "./chat-state";
import { messagingRequest, type ChatRequest } from "./messaging.client";
import { useChatRefresh } from "./use-chat-refresh";
import { useChatRead } from "./use-chat-read";
import MessageSafetyActions from "./MessageSafetyActions";
import MessageActions from "./MessageActions";
import ChatDateTools from "./ChatDateTools";
import SharedDateSheet from "./SharedDateSheet";
import { useDatePlans } from "./use-date-plans";
import type { DatePlanEvent, DateSheetTarget } from "./date-plans.types";
import type { ChatPartner } from "./messaging.types";
import chatStyles from "./chat.module.scss";

type ChatProps = { conversationId: string; userId: string; partner: ChatPartner; onAccessEnded: () => void; openingContext?: ReactNode; backAction?: ReactNode; initialDraft?: string; onViewProfile?: () => void; busy?: boolean; ariaLabel?: string; request?: ChatRequest; messagesPath?: string; renderReport?: (message: Message, onBlocked: () => void) => ReactNode; dateSpotsConversationId?: string; datePlansConversationId?: string };
export default function Chat(props: ChatProps) {
  return <ChatBody key={props.userId + ":" + props.conversationId} {...props}/>;
}

function isGrouped(earlier: Message | undefined, later: Message | undefined, earlierDate?: Date, laterDate?: Date) {
  if (!earlier || !later || !earlierDate || !laterDate || earlier.author !== later.author
    || earlier.dateSpot || later.dateSpot || earlier.datePlanEvent || later.datePlanEvent) return false;
  const elapsed = laterDate.getTime() - earlierDate.getTime();
  return elapsed >= 0 && elapsed <= 5 * 60_000 && earlierDate.toDateString() === laterDate.toDateString();
}

export function ChatIdentity({ partner, onViewProfile, busy }: { partner: ChatPartner; onViewProfile?: () => void; busy?: boolean }) {
  const name = <><ProfileAvatar name={partner.publicName} preset={partner.avatarPreset}/><span>{partner.publicName}</span></>;
  return <h1 className={chatStyles.chatIdentity} aria-label={partner.publicName}>
    {onViewProfile ? <button type="button" aria-label={`View ${partner.publicName}’s profile`} disabled={busy} onClick={onViewProfile}>
      {name}<span aria-hidden="true" className={chatStyles.chevron}>⌄</span>
    </button> : name}
  </h1>;
}

export function ChatTranscript({items, partnerName, partnerAvatar, busy, onReport, openingContext, onViewPlace, onSuggestTime, activeDate, renderDateEvent, onOpenDate}: {
  items: Message[]; partnerName: string; partnerAvatar?: string; busy: boolean; onReport: (message: Message) => void; openingContext?: ReactNode;
  onViewPlace?: (id: string, origin: HTMLButtonElement) => void; onSuggestTime?: (message: Message, origin: HTMLButtonElement) => void;
  activeDate?: boolean; renderDateEvent?: (event: DatePlanEvent) => ReactNode;
  onOpenDate?: (id: string, origin: HTMLButtonElement) => void;
}) {
  const shown = onOpenDate ? items.filter(item => !item.datePlanEvent || item.datePlanEvent.action === "propose") : items;
  const dates = shown.map(message => new Date(message.createdAt));
  const now = new Date();
  const today = now.toDateString();
  return <>{openingContext ? <div className={chatStyles.opening}>{openingContext}</div> : null}
    {shown.length ? <ol className={chatStyles.messages} role="log" aria-label="Conversation messages" aria-relevant="additions">{shown.map((message, index) => {
      const date = dates[index];
      const day = date.toDateString();
      const grouped = isGrouped(shown[index - 1], message, dates[index - 1], date);
      const hasNext = isGrouped(message, shown[index + 1], date, dates[index + 1]);
      const mine = message.author === "self";
      return <Fragment key={message.id}>
    {day !== dates[index - 1]?.toDateString() ? <li className={chatStyles.day}>
      {day === today ? "Today" : date.toLocaleDateString([], { month: "short", day: "numeric", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })}
    </li> : null}
    <li data-message-id={message.id} className={`${chatStyles.messageRow} ${mine ? chatStyles.mine : ""}`} data-grouped={grouped || undefined}>
      {!mine ? <div className={chatStyles.sender}>
        {!grouped ? <ProfileAvatar name={partnerName} preset={partnerAvatar}/> : null}
      </div> : null}
      <div className={chatStyles.messageBody}>
        <span className={chatStyles.srOnly}>{mine ? "You" : partnerName}: </span>
        <div className={chatStyles.bubble}>
    {message.datePlanEvent && onOpenDate ? <button className={chatStyles.dateBreadcrumb} type="button" data-plan-id={message.datePlanEvent.id}
      disabled={busy} onClick={event => onOpenDate(message.datePlanEvent!.id, event.currentTarget)}>Open date invite <span aria-hidden="true">↗</span></button>
      : message.datePlanEvent && renderDateEvent ? renderDateEvent(message.datePlanEvent) : <p>{message.text}</p>}
    {message.dateSpot && (onViewPlace || onSuggestTime) ? <div className={chatStyles.planActions}>
      {onViewPlace ? <button type="button" disabled={busy} onClick={event => onViewPlace(message.id, event.currentTarget)}>View place</button> : null}
      {onSuggestTime ? <button className={chatStyles.quietAction} type="button" disabled={busy} onClick={event => onSuggestTime(message, event.currentTarget)}>{activeDate ? "View current date plan" : "Suggest a time"}</button> : null}
    </div> : null}
        </div>
        <time className={hasNext ? chatStyles.srOnly : chatStyles.timestamp} dateTime={message.createdAt}>{date.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</time>
      </div>
      {!mine && !(onOpenDate && message.datePlanEvent) ? <MessageActions busy={busy} onReport={() => onReport(message)}/> : null}
    </li>
  </Fragment>;
  })}</ol> : <p className={chatStyles.empty}>Send a message to keep the conversation going.</p>}</>;
}

const accessEnded = (error: unknown) => error instanceof JourneyApiError && [401, 403, 404].includes(error.status);
const atLatest = (node: HTMLDivElement) => node.scrollHeight - node.scrollTop - node.clientHeight < 4;

function DateSheetLink({ onOpen }: { onOpen: (id: string) => void }) {
  const planId = useSearchParams()?.get("date");
  useEffect(() => {
    if (planId && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(planId)) onOpen(planId);
  }, [onOpen, planId]);
  return null;
}

function ChatBody({ conversationId, userId, partner, onAccessEnded, openingContext, backAction, initialDraft = "", onViewProfile, busy = false, ariaLabel = "Messages", request = messagingRequest, messagesPath, renderReport, dateSpotsConversationId, datePlansConversationId }: ChatProps) {
  const path = messagesPath ?? `/api/messaging/conversations/${conversationId}/messages`;
  const [page, setPage] = useState<Page | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const draftHint = useId();
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [closed, setClosed] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [actionError, setActionError] = useState("");
  const [report, setReport] = useState<Message | null>(null);
  const [sharedPlace, setSharedPlace] = useState<{ id: string } | null>(null);
  const [spotsOutage, setSpotsOutage] = useState(false);
  const [datePanel, setDatePanel] = useState<DateSheetTarget | null>(null);
  const sharedOrigin = useRef<HTMLElement | null>(null);
  const dateOrigin = useRef<HTMLElement | null>(null);
  const chatRoot = useRef<HTMLElement>(null);
  const clearSharedPlace = useCallback(() => {
    const origin = sharedOrigin.current;
    sharedOrigin.current = null;
    setSharedPlace(null);
    if (origin?.isConnected) origin.focus({ preventScroll: true });
    else if (origin) chatRoot.current?.querySelector<HTMLElement>("[data-date-toggle]")?.focus({ preventScroll: true });
  }, []);
  const refresh = useRef<(() => void) | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const ended = useRef(false);
  const session = useRef<ChatSession | null>(null);
  const sendLock = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const renderedPage = useRef<Page | null>(null);
  const deferredLatest = useRef<Page | null>(null);
  const [newMessages, setNewMessages] = useState(false);
  const reportClose = useRef<HTMLButtonElement>(null);
  const reportOrigin = useRef<HTMLElement | null>(null);
  const hasPage = page !== null;
  const sheet = !!datePlansConversationId;
  const displayedSequence = useCallback(() => {
    const node = viewport.current;
    const dialog = document.querySelector("dialog[open]");
    if (!node || ended.current || (dialog && !dialog.contains(node))) return null;
    const entries = renderedPage.current?.items ?? [];
    return readThroughSequence(entries, document.visibilityState === "visible", followLatest.current && atLatest(node), !!deferredLatest.current, message => {
      const item = node.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
      if (!item) return false;
      const bounds = node.getBoundingClientRect(), rect = item.getBoundingClientRect();
      const screen = document.documentElement;
      return Math.max(rect.top, bounds.top, 0) < Math.min(rect.bottom, bounds.bottom, screen.clientHeight)
        && Math.max(rect.left, bounds.left, 0) < Math.min(rect.right, bounds.right, screen.clientWidth);
    }, sheet);
  }, [sheet]);
  const checkRead = useChatRead(userId,conversationId,displayedSequence,sheet);

  useEffect(() => { checkRead(); },[page,checkRead]);
  useEffect(() => {
    window.addEventListener("scroll", checkRead, { passive:true });
    window.addEventListener("resize", checkRead);
    document.addEventListener("close",checkRead,true);
    return () => { window.removeEventListener("scroll",checkRead); window.removeEventListener("resize",checkRead); document.removeEventListener("close",checkRead,true); };
  },[checkRead]);

  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (followLatest.current) { node.scrollTop = node.scrollHeight; checkRead(); } });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasPage,checkRead]);

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
  const datePlans = useDatePlans(userId, closed ? undefined : datePlansConversationId, rememberPosition);
  const clearDateError = datePlans.clearError;
  const lastSpotOutage = useRef(false);
  const updateVenueAvailability = useCallback((available: boolean) => {
    if (lastSpotOutage.current === !available) return;
    lastSpotOutage.current = !available;
    rememberPosition();
    setSpotsOutage(!available);
  }, [rememberPosition]);

  useLayoutEffect(() => {
    renderedPage.current = page;
    const node = viewport.current;
    if (!node) return;
    if (followLatest.current) node.scrollTop = node.scrollHeight;
    else if (anchor.current) {
      const saved = anchor.current;
      const item = Array.from(node.querySelectorAll<HTMLElement>('[data-message-id]')).find(item => item.dataset.messageId === saved.id);
      if (item) node.scrollTop += item.getBoundingClientRect().top - node.getBoundingClientRect().top - saved.offset;
    }
    anchor.current = null;
  }, [page, datePlans.activePlan, spotsOutage]);

  const hideChat = useCallback(() => {
    ended.current = true;
    deferredLatest.current = null;
    setClosed(true);
    setPage(null);
    setDraft("");
    setReport(null);
    setDatePanel(null);
  }, []);

  useEffect(() => {
    const currentSession = new ChatSession(userId, conversationId, request, path, sheet);
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
        const result = await loadChatRefresh(renderedPage.current, cursor => currentSession.load(cursor), !!deferredLatest.current);
        if (!signal.aborted && !ended.current && document.visibilityState === "visible") {
          setSyncError("");
          if (result.deferred && !followLatest.current) {
            deferredLatest.current = result.deferred;
            setNewMessages(true);
            return;
          }
          deferredLatest.current = null;
          const latest = result.contiguous ?? result.deferred!;
          rememberPosition();
          const lastLoaded = renderedPage.current?.items.at(-1)?.id;
          if (!followLatest.current && lastLoaded && latest.items.at(-1)?.id !== lastLoaded) setNewMessages(true);
          setPage(previous => mergeLatestMessages(previous, latest));
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
  }, [path, userId, conversationId, request, hideChat, rememberPosition, sheet]);

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

  function jumpToLatest() {
    followLatest.current = true;
    setNewMessages(false);
    const deferred = deferredLatest.current;
    deferredLatest.current = null;
    if (deferred) setPage(deferred);
    else if (viewport.current) {
      viewport.current.scrollTop = viewport.current.scrollHeight;
      checkRead();
    }
  }

  function openDate(next: DateSheetTarget, origin?: HTMLElement) {
    if (!datePanel) dateOrigin.current = origin ?? (document.activeElement as HTMLElement | null);
    datePlans.clearError();
    setDatePanel(next);
  }
  const openLinkedDate = useCallback((id: string) => {
    dateOrigin.current ??= chatRoot.current?.querySelector<HTMLElement>("[data-date-toggle]") ?? null;
    clearDateError();
    setDatePanel({ kind: "plan", planId: id });
  }, [clearDateError]);
  function closeDate() {
    clearDateError();
    setDatePanel(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("date")) { url.searchParams.delete("date"); window.history.replaceState(null, "", url); }
    const origin = dateOrigin.current;
    dateOrigin.current = null;
    requestAnimationFrame(() => {
      if (origin?.isConnected && !origin.hasAttribute("disabled")) origin.focus({ preventScroll: true });
      else (chatRoot.current?.querySelector<HTMLElement>("[data-date-toggle]:not([disabled])") ??
        chatRoot.current?.querySelector<HTMLElement>("textarea"))?.focus({ preventScroll: true });
    });
  }
  const currentDate = datePlans.activePlan;
  const update = datePlans.unreadUpdate;
  const targetId = update?.planId ?? currentDate?.id;
  const loadingSummary = datePanel?.kind === "loading-summary";
  const summaryReady = datePlans.summaryStatus === "ready";
  useEffect(() => {
    if (!loadingSummary || !summaryReady) return;
    const frame = requestAnimationFrame(() => {
      setDatePanel(current => current?.kind === "loading-summary"
        ? (targetId ? { kind: "plan", planId: targetId } : { kind: "browse" }) : current);
    });
    return () => cancelAnimationFrame(frame);
  }, [loadingSummary, summaryReady, targetId]);
  const dateLabel = update ? (update.action === "propose" ? "Date invite" : update.action === "counter" ? "New time proposed" : "View date update")
    : currentDate ? (currentDate.state === "pending" && currentDate.proposer === "partner" ? (currentDate.revision > 1 ? "New time proposed" : "Date invite") : "View date")
    : "Plan a date";
  const showDot = !!update || datePlans.sharedSearchRequested;
  const sharedTarget = (message: Message, origin: HTMLButtonElement) => {
    openDate({ kind: "shared", venue: { id: message.id, name: message.text.replace(/^Suggested date spot: /, "") } }, origin);
  };
  const onReportBlocked = () => { hideChat(); onAccessEnded(); };
  function reportContent(message: Message) {
    return renderReport ? renderReport(message, onReportBlocked) : <MessageSafetyActions key={message.id} userId={userId} conversationId={conversationId}
      message={message} onBlocked={onReportBlocked}/>;
  }

  return <section ref={chatRoot} className={chatStyles.chat} aria-label={ariaLabel}>
    <div className={chatStyles.chatHeader}>
      {backAction}
      <ChatIdentity partner={partner} onViewProfile={!closed ? onViewProfile : undefined} busy={busy}/>
      {sheet && !closed ? <button className={chatStyles.dateToggle} data-date-toggle type="button" aria-haspopup="dialog" aria-expanded={!!datePanel}
        aria-label={update ? dateLabel + " · unread update" : datePlans.sharedSearchRequested ? dateLabel + " · shared search requested" : undefined}
        disabled={busy} onClick={event => openDate(!summaryReady ? { kind: "loading-summary" }
          : targetId ? { kind: "plan", planId: targetId } : { kind: "browse" }, event.currentTarget)}>
        {dateLabel}{showDot ? <span className={chatStyles.inviteDot} aria-hidden="true"/> : null}</button> : null}
    </div>
    {sheet && !closed ? <Suspense><DateSheetLink onOpen={openLinkedDate}/></Suspense> : null}
    {closed ? <p role="status">This chat is no longer available.</p> : <>
      {!page && !syncError ? <p role="status">Loading messages…</p> : null}
      {syncError ? <p role="alert">{syncError} <button type="button" onClick={() => refresh.current?.()}>Retry</button></p> : null}
      {page ? <div ref={viewport} className={chatStyles.viewport} role="region" aria-label="Scrollable conversation" tabIndex={0}
        onScroll={event => { const node = event.currentTarget; followLatest.current = !deferredLatest.current && atLatest(node); if (followLatest.current) setNewMessages(false); checkRead(); }}>
      {page?.nextCursor ? <button type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading…" : "Load older messages"}</button> : null}
      <ChatTranscript items={page.items} partnerName={partner.publicName} partnerAvatar={partner.avatarPreset} busy={busy} onReport={setReport} openingContext={openingContext}
        onViewPlace={dateSpotsConversationId && !spotsOutage ? (id, origin) => {
          const message = page.items.find(item => item.id === id);
          if (sheet && message) sharedTarget(message, origin);
          else { sharedOrigin.current = origin; setSharedPlace({ id }); }
        } : undefined}
        onSuggestTime={sheet && !dateSpotsConversationId ? sharedTarget : undefined}
        onOpenDate={sheet ? (planId, origin) => openDate({ kind: "plan", planId }, origin) : undefined}/>
      </div> : null}
      {newMessages ? <button className={chatStyles.newMessages} type="button" onClick={jumpToLatest}>New messages · Jump to latest ↓</button> : null}
      {report ? <div role="region" aria-label="Report selected message">
        <button ref={reportClose} type="button" onClick={() => { setReport(null); reportOrigin.current?.focus(); }}>Close message report</button>
        {reportContent(report)}
      </div> : null}
      {page ? <ChatDateTools userId={userId} dateSpotsConversationId={sheet ? undefined : dateSpotsConversationId} activePlan={null}
        sharedPlace={sharedPlace} clearSharedPlace={clearSharedPlace} onVenueAvailability={updateVenueAvailability} onCurrentPlan={() => {}}>
        <form className={chatStyles.composer} onSubmit={event => { event.preventDefault(); void send(); }}>
        {initialDraft && draft.trim() ? <p id={draftHint} className={chatStyles.muted}>Draft · Only you can see this until you send it.</p> : null}
        <label><span className={chatStyles.srOnly}>Message</span><textarea aria-describedby={initialDraft && draft.trim() ? draftHint : undefined} rows={1} maxLength={2000} value={draft} disabled={sending || busy} placeholder="Write a message…" onChange={event => setDraft(event.target.value)}/></label>
        <button className={chatStyles.send} type="submit" aria-label={sending ? "Sending…" : "Send message"} disabled={!draft.trim() || sending || busy}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>
        </button>
        <p className={chatStyles.muted}>Up to 2,000 characters. Unsent messages aren’t saved when you leave.</p>
        </form>
      </ChatDateTools> : null}
      {datePanel && datePlansConversationId ? <SharedDateSheet key={datePanel.kind === "shared" ? datePanel.venue.id : undefined}
        target={datePanel} userId={userId} conversationId={datePlansConversationId} spotsId={dateSpotsConversationId}
        partnerName={partner.publicName} onClose={closeDate} busy={busy || datePlans.busy} error={datePlans.error} clearError={datePlans.clearError}
        summaryUnavailable={datePlans.summaryStatus === "unavailable"} retrySummary={datePlans.refresh} sharedSearchRequested={datePlans.sharedSearchRequested}
        act={datePlans.act} exportCalendar={datePlans.exportCalendar} currentPlanId={currentDate?.id} renderReport={reportContent}
        showPlan={planId => openDate({ kind: "plan", planId })}/> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
    </>}
  </section>;
}

