"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import DatePlanCard from "./DatePlanCard";
import DatePlanForm, { DatePlanDialog } from "./DatePlanForm";
import DateSpots from "./DateSpots";
import DateSpotVenue from "./DateSpotVenue";
import MessageActions from "./MessageActions";
import { formatDatePlanTime } from "./date-plan-time";
import type { DatePlanAction, DatePlanDetail, DatePlanReply, DatePlanTimeInput, DatePlanVenue, DatePlanVenues, DateSheetTarget } from "./date-plans.types";
import type { VenueDetails } from "./date-spots.types";
import { messagingRequest } from "./messaging.client";
import type { ChatMessage } from "./messaging.types";
import { signalChatRefresh, useChatRefresh } from "./use-chat-refresh";
import { signalUnreadChats } from "../notifications/message-alerts.client";
import styles from "./chat.module.scss";

const noAction = () => {};
const actionLabels = { propose: "Sent a date invite", counter: "Proposed another time", confirm: "Confirmed the date",
  decline: "Declined the invite", withdraw: "Withdrew the invite", cancel: "Canceled the date" };
type Selection = { name: string; ticket: string } | (DatePlanVenue & { address?: string });
type Props = {
  userId: string; conversationId: string; spotsId?: string; target: DateSheetTarget; partnerName: string;
  busy: boolean; error: string; onClose: () => void; clearError: () => void;
  act: (action: DatePlanAction) => Promise<DatePlanReply | null>; exportCalendar: (id: string) => Promise<void>;
  showPlan: (id: string) => void; currentPlanId?: string; renderReport: (message: ChatMessage) => ReactNode;
};

export default function SharedDateSheet(props: Props) {
  const { target, onClose } = props;
  return <DatePlanDialog title={target.kind === "plan" ? "Your date plan" : "Plan a date"} onClose={onClose} className={styles.dateSheet}>
    {target.kind === "plan" ? <DatePlanDetailView key={target.planId} {...props} planId={target.planId}/>
      : <DateInviteComposer {...props} shared={target.kind === "shared" ? target.venue : undefined}/>}
    {props.error ? <p role="alert">{props.error}</p> : null}
  </DatePlanDialog>;
}

function DateInviteComposer({ userId, conversationId, spotsId, busy, act, showPlan, currentPlanId, clearError, shared }: Props & { shared?: DatePlanVenue }) {
  const path = `/api/messaging/conversations/${conversationId}/date-plans`;
  const [venues, setVenues] = useState<DatePlanVenues>();
  const [venueError, setVenueError] = useState(false);
  const [picker, setPicker] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [preview, setPreview] = useState<DatePlanVenue | null>(shared ?? null);
  const listRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const listVenues = useCallback((before?: string) => {
    if (listRequest.current) return;
    const request = new AbortController();
    listRequest.current = request;
    void messagingRequest<DatePlanVenues>(userId, path + "/venues" + (before ? "?before=" + before : ""), { signal: request.signal })
      .then(value => {
        if (request.signal.aborted) return;
        setVenueError(false);
        setVenues(previous => before && previous ? { ...value, items: [...previous.items, ...value.items] } : value);
      }).catch(() => { if (!request.signal.aborted) setVenueError(true); })
      .finally(() => { if (listRequest.current === request) listRequest.current = null; });
  }, [path, userId]);
  useEffect(() => {
    mounted.current = true;
    listVenues();
    return () => { mounted.current = false; listRequest.current?.abort(); listRequest.current = null; };
  }, [listVenues]);

  function choose(place: Selection) {
    clearError();
    setSelected(place);
  }
  async function publish(place: Selection, time: DatePlanTimeInput) {
    const proposal = await act({ action: "propose", time, ...("ticket" in place ? { ticket: place.ticket } : { sourceMessageId: place.id }) });
    const id = proposal?.message.datePlanEvent?.id;
    if (id && mounted.current) showPlan(id);
  }
  if (currentPlanId) return <>
    <p>There’s already a date plan for this chat.</p>
    <button type="button" onClick={() => showPlan(currentPlanId)}>View date plan</button>
    {preview && spotsId ? <VenuePreview userId={userId} conversationId={spotsId} target={{ action: "sharedDetails", messageId: preview.id }}
      name={preview.name} onBack={() => setPreview(null)}/> : null}
  </>;
  return <>
    <div hidden={!!selected || !!preview}>
      <p className={styles.muted}>Choose a place, then send your invite with a day and time.</p>
      {spotsId ? <DateSpots userId={userId} conversationId={spotsId} open shared={null} clearShared={noAction}
        onSelectSpot={spot => choose({ name: spot.name, ticket: spot.ticket })}/> : null}
      {venues?.items.length ? <div className={styles.sheetSaved}>
        <button type="button" aria-expanded={picker} onClick={() => setPicker(value => !value)}>Use a shared place</button>
        {picker ? <ul aria-label="Shared places">{venues.items.map(place => <li key={place.id}>
          <button type="button" onClick={() => setPreview(place)}>{place.name}</button>
        </li>)}</ul> : null}
        {picker && venues.nextCursor ? <button type="button" onClick={() => listVenues(venues.nextCursor!)}>Earlier places</button> : null}
      </div> : null}
      {venueError ? <p role="status">Couldn’t load shared places. <button type="button" onClick={() => listVenues()}>Retry</button></p> : null}
      {!spotsId && venues && !venues.items.length ? <p>No shared places yet. You can still talk through ideas in chat.</p> : null}
    </div>
    {preview && !selected ? <VenuePreview key={preview.id} userId={userId} conversationId={spotsId}
      target={{ action: "sharedDetails", messageId: preview.id }} name={preview.name}
      onBack={() => setPreview(null)} onSelect={() => choose(preview)}/> : null}
    {selected ? <section className={styles.planCard} aria-label="Choose a day and time">
      <button className={styles.quietAction} type="button" onClick={() => { clearError(); setSelected(null); }} disabled={busy}>← Back to place</button>
      <DatePlanForm venueName={selected.name} busy={busy} onSubmit={time => publish(selected, time)} submitLabel="Send invite"/>
    </section> : null}
  </>;
}

type VenueRequest = { action: "sharedDetails"; messageId: string } | { action: "planDetails"; planId: string };
function VenuePreview({ userId, conversationId, target, name, onBack, onSelect }: {
  userId: string; conversationId?: string; target: VenueRequest; name: string; onBack: () => void; onSelect?: () => void;
}) {
  const [result, setResult] = useState<VenueDetails | null>();
  const body = JSON.stringify(target);
  useEffect(() => {
    if (!conversationId) return;
    const { signal, abort } = makeRequest();
    void messagingRequest<{ venue: VenueDetails }>(userId, `/api/messaging/conversations/${conversationId}/date-spots`,
      { method: "POST", signal, body }).then(value => { if (!signal.aborted) setResult(value.venue); })
      .catch(() => { if (!signal.aborted) setResult(null); });
    return abort;
  }, [body, conversationId, userId]);
  if (result) return <DateSpotVenue venue={result} busy={false} onBack={onBack} onSelect={onSelect}/>;
  return <section className={styles.planCard} aria-label="Venue details">
    <button type="button" onClick={onBack}>← Back</button><h3>{name}</h3>
    <p role="status">{conversationId && result === undefined ? "Loading place details…" : "Photos and place details aren’t available right now."}</p>
    {onSelect ? <button type="button" className={styles.primary} onClick={onSelect}>Choose this place</button> : null}
  </section>;
}

function makeRequest() {
  const controller = new AbortController();
  return { signal: controller.signal, abort: () => controller.abort() };
}

function DatePlanDetailView({ userId, conversationId, planId, spotsId, partnerName, busy, act, clearError, exportCalendar, currentPlanId, showPlan, renderReport }: Props & { planId: string }) {
  const path = `/api/messaging/conversations/${conversationId}/date-plans/${planId}`;
  const [detail, setDetail] = useState<DatePlanDetail>();
  const [unavailable, setUnavailable] = useState(false);
  const [counter, setCounter] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [report, setReport] = useState<ChatMessage | null>(null);
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const receipt = useRef<bigint>(BigInt(0));
  const updateSummary = useRef<HTMLParagraphElement>(null);
  const refresh = useCallback(() => {
    if (!mounted.current) return;
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    void messagingRequest<DatePlanDetail>(userId, path, { signal: request.signal }).then(value => {
      if (!request.signal.aborted && value.plan.id === planId) { setDetail(value); setUnavailable(false); }
    }).catch(() => {
      if (!request.signal.aborted) { setUnavailable(true); setDetail(undefined); }
    });
  }, [path, planId, userId]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); };
  }, []);
  useChatRefresh({ userId, onRefresh: refresh });
  const plan = detail?.plan;
  const latest = detail?.activity.at(-1)?.datePlanEvent;
  const partnerEvent = detail?.activity.findLast(row => row.author === "partner" && row.datePlanEvent);
  const partnerSequence = partnerEvent?.sequence;
  const canCounter = !!(plan && detail.canAct && counter === plan.revision && plan.state === "pending" && plan.proposer === "partner");
  useEffect(() => {
    if (!partnerSequence || canCounter || report || preview) return;
    const through = BigInt(partnerSequence);
    const update = updateSummary.current;
    const dialog = update?.closest("dialog");
    if (!update || !dialog) return;
    const request = new AbortController();
    let reading = false;
    const mark = () => {
      if (reading || request.signal.aborted || receipt.current >= through || document.visibilityState !== "visible" || !dialog.open) return;
      const bounds = dialog.getBoundingClientRect(), shown = update.getBoundingClientRect();
      if (shown.bottom <= Math.max(bounds.top, 0) || shown.top >= Math.min(bounds.bottom, window.innerHeight)) return;
      reading = true;
      void messagingRequest<{ through: string }>(userId, path + "/read", { method: "POST", signal: request.signal, body: JSON.stringify({ through: partnerSequence }) })
        .then(value => {
          if (request.signal.aborted) return;
          receipt.current = BigInt(value.through);
          signalUnreadChats(userId);
          signalChatRefresh(userId);
        }).catch(() => {}).finally(() => { reading = false; });
    };
    const frame = requestAnimationFrame(mark);
    document.addEventListener("visibilitychange", mark);
    window.addEventListener("focus", mark);
    dialog.addEventListener("scroll", mark, { passive: true });
    return () => {
      request.abort(); cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", mark);
      window.removeEventListener("focus", mark); dialog.removeEventListener("scroll", mark);
    };
  }, [canCounter, partnerSequence, path, preview, report, userId]);
  if (unavailable) return <p role="status">Couldn’t open this date plan. <button type="button" onClick={refresh}>Retry</button></p>;
  if (!plan || !latest) return <p role="status">Opening date plan…</p>;
  if (preview) return <VenuePreview userId={userId} conversationId={spotsId} target={{ action: "planDetails", planId }}
    name={plan.venueName} onBack={() => setPreview(false)}/>;
  if (report) return <section aria-label="Report selected date update" className={styles.planCard}>
    <button type="button" onClick={() => setReport(null)}>← Back to date plan</button>{renderReport(report)}
  </section>;
  if (canCounter) return <section className={styles.planCard} aria-label="Suggest another time">
    <button type="button" onClick={() => { clearError(); setCounter(null); }} disabled={busy}>← Back to date plan</button>
    <DatePlanForm venueName={plan.venueName} startsAt={plan.startsAt} busy={busy} submitLabel="Send new time" onSubmit={async time => {
      if (await act({ action: "counter", planId, revision: plan.revision, time }) && mounted.current) { setCounter(null); refresh(); }
    }}/>
  </section>;
  return <>
    {partnerEvent?.datePlanEvent ? <p ref={updateSummary} className={styles.muted}>{partnerName} · {actionLabels[partnerEvent.datePlanEvent.action]}
      {" · "}{formatDatePlanTime(partnerEvent.datePlanEvent.startsAt)}</p> : null}
    <DatePlanCard event={latest} activePlan={detail.canAct ? plan : null} busy={busy}
      onAction={(action, current) => void act({ action, planId, revision: current.revision }).then(() => refresh())}
      onCounter={current => { clearError(); setCounter(current.revision); }} onCalendar={id => void exportCalendar(id)}/>
    {!detail.canAct && (plan.state === "pending" || plan.state === "confirmed") ? <p className={styles.muted}>This date has passed.</p> : null}
    {spotsId ? <button type="button" onClick={() => setPreview(true)}>View place</button> : null}
    {currentPlanId && currentPlanId !== planId ? <button type="button" onClick={() => showPlan(currentPlanId)}>View current date</button> : null}
    <details className={styles.dateActivity}><summary>Date activity</summary><ol>
      {detail.activity.map(entry => entry.datePlanEvent ? <li key={entry.id}>
        <div><strong>{entry.author === "self" ? "You" : partnerName}</strong> · {actionLabels[entry.datePlanEvent.action]}</div>
        <time dateTime={entry.datePlanEvent.startsAt}>{formatDatePlanTime(entry.datePlanEvent.startsAt)}</time>
        {entry.author === "partner" ? <MessageActions busy={busy} onReport={() => setReport(entry)}/> : null}
      </li> : null)}
    </ol></details>
  </>;
}
