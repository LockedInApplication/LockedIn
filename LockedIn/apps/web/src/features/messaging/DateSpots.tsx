"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { messagingRequest } from "./messaging.client";
import { signalChatRefresh, useChatRefresh } from "./use-chat-refresh";
import DateSpotVenue, { PlaceCredits } from "./DateSpotVenue";
import { dateInterests, type DateAction, type DateInterest, type DateRequest, type DateSpotState, type Spot, type Suggestions, type VenueDetails } from "./date-spots.types";
import styles from "./date-spots.module.scss";

type Setup = "solo" | "start" | "accept";
type Reply = Suggestions | { status: "request"; request: DateRequest | null } | { status: "details"; venue: VenueDetails }
  | { status: "shared" | "forgotten" };
type Detail = { venue: VenueDetails; spot?: Spot } | null;

export default function DateSpots({ userId, conversationId, open, shared, clearShared, onIncoming }: {
  userId: string; conversationId: string; open: boolean; shared: { id: string } | null; clearShared: () => void;
  onIncoming: (incoming: boolean) => void;
}) {
  const path = `/api/messaging/conversations/${conversationId}/date-spots`;
  const [state, setState] = useState<DateSpotState | null>(null);
  const [mode, setMode] = useState<"solo" | "mutual" | null>(null);
  const [form, setForm] = useState<Setup | null>(null);
  const [areaId, setAreaId] = useState("");
  const [interests, setInterests] = useState<DateInterest[]>([]);
  const [remember, setRemember] = useState(false);
  const [results, setResults] = useState<Suggestions | null>(null);
  const [detail, setDetail] = useState<Detail>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const reading = useRef(false);
  const actionRunning = useRef(false);
  const autoSearched = useRef("");
  const shareId = useRef<{ ticket: string; id: string } | null>(null);
  const detailsPanel = useRef<HTMLDivElement>(null);
  const sharedSelection = useRef<{ id: string } | null>(null);
  const sharedAttempt = useRef<{ id: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    return () => { controller.abort(); active.current = null; reading.current = false; actionRunning.current = false; };
  },[]);

  const refresh = useCallback(() => {
    const signal = active.current?.signal;
    if (!signal || reading.current || actionRunning.current) return;
    const captured = generation.current;
    reading.current = true;
    void messagingRequest<DateSpotState>(userId,path,{ signal }).then(value => {
      if (!signal.aborted && captured === generation.current) setState(value);
    }).catch(() => {}).finally(() => { if (!signal.aborted) reading.current = false; });
  },[path,userId]);
  useChatRefresh({ userId, onRefresh:refresh });

  const run = useCallback(async (payload: DateAction): Promise<Reply | null> => {
    const signal = active.current?.signal;
    if (!signal || actionRunning.current) return null;
    actionRunning.current = true;
    generation.current++;
    setBusy(true); setError(""); setNote("");
    try {
      const value = await messagingRequest<Reply>(userId,path,{ method:"POST", body:JSON.stringify(payload), signal });
      if (signal.aborted) return null;
      if (value.status === "request") setState(current => current ? { ...current, request:value.request } : current);
      if (value.status === "suggestions") setResults(value);
      if (value.status === "forgotten") setState(current => current ? { ...current, remembered:false, areaId:null } : current);
      return value;
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not open date spots. Try again.");
      return null;
    } finally {
      if (!signal.aborted) { actionRunning.current = false; setBusy(false); }
    }
  },[path,userId]);

  const request = state?.request;
  const mutualReady = request?.state === "ready" ? request.id : null;
  useEffect(() => {
    if (mode !== "mutual" || !mutualReady || form || detail || shared || busy || autoSearched.current === mutualReady) return;
    let stopped = false;
    queueMicrotask(() => {
      if (stopped || actionRunning.current) return;
      autoSearched.current = mutualReady;
      void run({ action:"mutual", id:mutualReady });
    });
    return () => { stopped = true; };
  },[mode,mutualReady,form,detail,shared,busy,run]);

  useEffect(() => {
    sharedSelection.current = shared;
    if (!shared || busy || sharedAttempt.current === shared) return;
    queueMicrotask(() => {
      if (sharedSelection.current !== shared || actionRunning.current || sharedAttempt.current === shared) return;
      sharedAttempt.current = shared;
      setDetail(null);
      void run({ action:"sharedDetails", messageId:shared.id }).then(value => {
        if (sharedSelection.current === shared && value?.status === "details") setDetail({ venue:value.venue });
      });
    });
  },[shared,busy,run]);
  useEffect(() => {
    if (detail) detailsPanel.current?.querySelector("button")?.focus();
  },[detail]);

  const openForm = (action: Setup) => {
    setForm(action); setAreaId(state?.areaId ?? ""); setInterests(state?.interests ?? []);
    setRemember(false); setResults(null); setDetail(null); setError("");
  };
  const choose = async (action: Setup, forceForm = false) => {
    setMode(action === "solo" ? "solo" : "mutual"); setResults(null); setError(""); setDetail(null); clearShared();
    if (!state || !state.areaId || forceForm) { openForm(action); if (!state) refresh(); return; }
    setForm(null);
    await run({ action, preferences:{ areaId:state.areaId, interests:state.interests }, ...(action === "accept" && request ? { id:request.id } : {}) });
  };
  const goMutual = () => {
    if (request) {
      autoSearched.current = ""; setMode("mutual"); setForm(null); setResults(null); setDetail(null); clearShared(); setError("");
    } else void choose("start");
  };
  const removeRequest = async () => {
    if (!request) return;
    if (await run({ action:"cancel", id:request.id })) { setResults(null); setMode(null); setForm(null); autoSearched.current = ""; }
  };
  const viewSpot = async (spot: Spot) => {
    const value = await run({ action:"details",ticket:spot.ticket });
    if (value?.status === "details") setDetail({ venue:value.venue,spot });
  };
  const share = async (spot: Spot) => {
    if (shareId.current?.ticket !== spot.ticket) shareId.current = { ticket:spot.ticket,id:crypto.randomUUID() };
    const value = await run({ action:"share",ticket:spot.ticket,requestId:shareId.current.id });
    if (value?.status === "shared") {
      shareId.current = null; setDetail(null); setMode(null); setResults(null); setNote("Place shared in chat."); signalChatRefresh(userId);
    }
  };
  function closeDetail() { setDetail(null); clearShared(); setError(""); }
  const areaLabel = state?.areas.find(area => area.areaId === state.areaId)?.label;
  const incoming = request?.state === "pending" && request.from === "partner";
  useEffect(() => { onIncoming(incoming); }, [onIncoming, incoming]);
  if (!open && !shared) return null;

  return <div className={styles.planner} aria-label="Date spots">
    {!shared ? <>
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={goMutual}>{mutualReady ? "See picks for both of you" : incoming ? "Respond to shared search" : request ? "View shared search request" : "Find together"}</button>
        <button type="button" disabled={busy} onClick={() => void choose("solo")}>Browse on my own</button>
      </div>
      <p className={styles.muted}>Only the place you share appears in chat. Starting areas stay private.</p>
    </> : null}
    {note ? <p role="status">{note}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {detail ? <div ref={detailsPanel}><DateSpotVenue key={detail.venue.name} venue={detail.venue} reason={detail.spot?.reason}
      busy={busy} onBack={closeDetail} onShare={detail.spot ? () => void share(detail.spot!) : undefined}/></div> : shared ? <section className={styles.panel}>
      {busy ? <p role="status">Opening place…</p> : null}
      <div><button type="button" disabled={busy} onClick={closeDetail}>← Back to chat</button></div>
    </section> : <>
      {incoming && !form ? <section className={styles.panel} aria-label="Date-spot invitation">
        <h3>Find a spot together?</h3><p>Your match is ready to look. Use your starting area and interests for this search. Your starting area stays private.</p>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" disabled={busy} onClick={() => void choose("accept")}>{areaLabel ? `Use my area · ${areaLabel}` : "Choose my area"}</button>
          {areaLabel ? <button type="button" disabled={busy} onClick={() => void choose("accept",true)}>Change area</button> : null}
          <button type="button" disabled={busy} onClick={() => void removeRequest()}>Not now</button>
        </div>
      </section> : null}
      {form ? <section className={styles.panel}><h3>{form === "solo" ? "Find a date spot" : "Find somewhere for both of you"}</h3>
        {!state ? <p>Couldn’t load meetup areas yet. <button type="button" onClick={refresh}>Retry</button></p> : <form className={styles.form} onSubmit={event => {
          event.preventDefault(); if (!areaId) return; const action = form;
          void run({ action, preferences:{ areaId, interests }, remember, ...(action === "accept" && request ? { id:request.id } : {}) }).then(value => {
            if (value) { setForm(null); refresh(); }
          });
        }}>
          <label className={styles.areaField}>Starting area<select value={areaId} onChange={event => setAreaId(event.target.value)} required>
            <option value="">Choose a city or neighborhood</option>{state.areas.map(area => <option key={area.areaId} value={area.areaId}>{area.label}</option>)}
          </select></label>
          <div><p>Interests · pick up to 3 in order</p><div className={styles.chips}>{dateInterests.map(([key,label]) =>
            <button key={key} type="button" aria-pressed={interests.includes(key)} disabled={busy || (!interests.includes(key) && interests.length >= 3)}
              onClick={() => setInterests(values => values.includes(key) ? values.filter(value => value !== key) : [...values,key])}>{label}</button>)}</div></div>
          <label><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/> Remember privately for next time</label>
          <p className={styles.muted}>Use a broad area where you’re happy to start. No home address or GPS needed.</p>
          <div className={styles.actions}>
            <button className={styles.primary} type="submit" disabled={!areaId || busy}>{form === "solo" ? "Show places" : form === "start" ? "Send request" : "Use this area"}</button>
            <button type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button>
            {state.remembered ? <button type="button" disabled={busy} onClick={() => void run({ action:"forget" }).then(value => {
              if (value) { setAreaId(""); setInterests([]); setNote("Saved preferences removed."); refresh(); }
            })}>Forget saved preferences</button> : null}
          </div>
        </form>}
      </section> : null}
      {!form && mode === "mutual" && request?.state === "pending" && request.from === "self" ? <section className={styles.panel}>
        <h3>Request sent</h3><p>Waiting for your match. You can still look for places on your own.</p>
        <div><button type="button" disabled={busy} onClick={() => void removeRequest()}>Withdraw request</button></div>
      </section> : null}
      {!form && busy && !results ? <p role="status">{mode === "solo" || mutualReady ? "Looking for places…" : "One moment…"}</p> : null}
      {!form && mode === "mutual" && mutualReady && error && !results ? <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={() => void run({ action:"mutual",id:mutualReady })}>Try again</button>
        <button type="button" disabled={busy} onClick={() => void removeRequest()}>End shared search</button>
      </div> : null}
      {!form && results && (mode === "solo" || (mode === "mutual" && mutualReady)) ? <section className={styles.panel} aria-label="Suggested date spots">
        <h3>{mode === "mutual" ? "Good spots for you both" : "Date spots near you"}</h3>
        {results.items.length ? <>
          {mode === "mutual" ? <p className={styles.muted}>Ranked by your interests and estimated straight-line distance.</p> : null}
          <ul className={styles.choices}>{results.items.map(spot => <li key={spot.ticket}><button type="button" disabled={busy} onClick={() => void viewSpot(spot)}>
            <strong>{spot.name} <span aria-hidden="true">›</span></strong>
            {spot.address ? <span className={styles.muted}>{spot.address}</span> : null}<span>{spot.reason}</span>
          </button></li>)}</ul>
          <PlaceCredits/>
        </> : <p>{results.reason === "too-far" ? "Your starting areas are too far apart for this search. Try a meetup area you both want to visit." : "We didn’t find a good spot this time. Try a different area or interest."}</p>}
        <div className={styles.actions}>
          {mode === "solo" || !results.items.length ? <button type="button" disabled={busy} onClick={() => void choose("solo",true)}>Change area or interests</button> : null}
          {mode === "mutual" && request ? <button type="button" disabled={busy} onClick={() => void removeRequest()}>End shared search</button> : null}
          <button type="button" disabled={busy} onClick={() => { setMode(null); setResults(null); }}>Close suggestions</button>
        </div>
      </section> : null}
      {!form && mode === "solo" && state && !results && !busy && error ? <div className={styles.actions}>
        <button type="button" onClick={() => void choose("solo")}>Retry search</button><button type="button" onClick={() => openForm("solo")}>Change area or interests</button>
      </div> : null}
    </>}
  </div>;
}
