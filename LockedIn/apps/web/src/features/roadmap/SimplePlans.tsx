"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { JourneyApiError, journeyRequest } from "@/features/journey/journey.client";
import type { SimplePlan } from "./roadmap.types";
import styles from "./styles/simple-plans.module.scss";

type PlanFields = { title: string; note: string | null; day: string | null; timeZone?: string };
type Edit = { counter: SimplePlan | null; title: string };
type Action = "accept" | "counter" | "pass" | "withdraw" | "done" | "undo-done" | "cancel";
const presets = ["Cook together", "Try a new spot", "Make time to talk"];
const labels = { PASSED: "Passed", WITHDRAWN: "Withdrawn", DONE: "Done", CANCELED: "Canceled" };
const actionFeedback: Partial<Record<Action, string>> = {
  accept: "Added to Coming up.",
  counter: "Your change was sent for their reply.",
  done: "Plan marked done. You can undo it in Past plans.",
  "undo-done": "Plan moved back to Coming up.",
};
const calendar = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const completionCalendar = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function completionOpening(plan: SimplePlan) {
  // Match the API's fallback if the web build is running ahead of the API.
  return plan.day ? plan.completionOpensAt ?? `${plan.day}T12:00:00.000Z` : null;
}

type Props = {
  relationshipId: string;
  userId: string;
  plans: SimplePlan[];
  busy: boolean;
  onDiscard: () => void;
  onEditing: (editing: boolean) => void;
  onConflict: () => void;
  onOpenPlanMemory?: (id: string) => void;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
};

export default function SimplePlans({ relationshipId, userId, plans, busy, onConflict, onDiscard, onEditing, onOpenPlanMemory, runAction }: Props) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => () => onEditing(false), [onEditing]);
  const retry = useRef<{ signature: string; requestId: string } | null>(null);
  const completed = useRef<string | null>(null);
  const pastDetails = useRef<HTMLDetailsElement>(null);
  const pending = plans.filter(plan => plan.status === "PENDING");
  const inbox = pending.filter(plan => !plan.yours);
  const outgoing = pending.filter(plan => plan.yours);
  const today = localDay(new Date(now));
  const rank = (day: string | null) => day ? (day >= today ? 0 : 2) : 1;
  const upcoming = plans.filter(plan => plan.status === "ACCEPTED").sort((a, b) => rank(a.day) - rank(b.day) || (a.day ?? "").localeCompare(b.day ?? ""));
  const past = plans.filter(plan => plan.status !== "PENDING" && plan.status !== "ACCEPTED");
  const disableCardActions = busy || edit !== null;
  const nextOpening = upcoming.reduce((earliest, plan) => {
    const opening = completionOpening(plan);
    const ms = opening ? Date.parse(opening) : 0;
    return ms > now ? Math.min(earliest, ms) : earliest;
  }, Infinity);

  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      const time = Date.now();
      setNow(time);
      if (Number.isFinite(nextOpening) && nextOpening > time) {
        timer = window.setTimeout(refresh, Math.min(2_147_483_647, nextOpening - time));
      }
    };
    if (Number.isFinite(nextOpening)) timer = window.setTimeout(refresh, 0);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [nextOpening]);

  useEffect(() => {
    if (!completed.current) return;
    const plan = plans.find(item => item.id === completed.current);
    if (plan?.status !== "DONE") return;
    completed.current = null;
    if (pastDetails.current) pastDetails.current.open = true;
    const card = document.getElementById(`step-${encodeURIComponent(plan.id)}`);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [plans]);

  function updateEdit(value: Edit | null) {
    setEdit(value);
    onEditing(value !== null);
  }

  function submitCommand(plan: SimplePlan | null, action: Action | null, fields?: PlanFields) {
    if (busy) return;
    const payload = plan && action ? { action, version: plan.version, ...(fields ? { plan: fields } : {}) } : { plan: fields };
    const signature = JSON.stringify([plan?.id ?? null, payload]);
    const requestId = retry.current?.signature === signature ? retry.current.requestId : crypto.randomUUID();
    retry.current = { signature, requestId };
    const path = `/api/journey/relationships/${encodeURIComponent(relationshipId)}/plans${plan ? `/${encodeURIComponent(plan.id)}` : ""}`;
    void runAction(async () => {
      try {
        await journeyRequest(path, { method: "POST", headers: { "x-roadmap-owner": userId }, body: JSON.stringify({ ...payload, requestId }) });
        if (action === "done" && plan) completed.current = plan.id;
        retry.current = null;
        updateEdit(null);
      } catch (error) {
        if (error instanceof JourneyApiError && error.status === 409 && plan) {
          updateEdit(null);
          onConflict();
        }
        throw error;
      }
    }, action ? actionFeedback[action] ?? "Plan updated." : "Suggestion sent.");
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const note = String(data.get("note") ?? "").trim() || null;
    const day = String(data.get("day") ?? "") || null;
    if (title.length < 3) {
      const input = event.currentTarget.elements.namedItem("title") as HTMLInputElement;
      input.setCustomValidity("Write at least three characters.");
      input.reportValidity();
      return;
    }
    const timeZone = day ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
    submitCommand(edit.counter, edit.counter ? "counter" : null, { title, note, day, timeZone });
  }

  function card(plan: SimplePlan) {
    const id = `step-${encodeURIComponent(plan.id)}`;
    const opening = completionOpening(plan);
    const lockedUntil = opening && Date.parse(opening) > now ? opening : null;
    const memoryAction = onOpenPlanMemory && (plan.status === "DONE" || plan.hasMemory)
      ? <button type="button" disabled={disableCardActions} onClick={() => onOpenPlanMemory(plan.id)}>
        {plan.hasMemory ? "Open memory" : "Save a memory"}
      </button> : null;
    return <article className={styles.plan} key={plan.id} id={id} tabIndex={-1}>
      <h4>{plan.title}</h4>
      <p className={styles.meta}>{plan.day ? calendar.format(new Date(`${plan.day}T12:00:00Z`)) : "No day picked yet"}</p>
      {plan.note ? <p>{plan.note}</p> : null}
      {plan.status === "PENDING" ? <>
        <p className={styles.meta}>{plan.yours ? "Waiting for their reply" : `${plan.proposerName} suggested`}</p>
        <div className={styles.actions}>
          {plan.yours ? <button type="button" disabled={disableCardActions} onClick={() => submitCommand(plan, "withdraw")}>Withdraw</button> : <>
            <button type="button" className={styles.primary} disabled={disableCardActions} onClick={() => submitCommand(plan, "accept")}>Accept</button>
            <button type="button" disabled={disableCardActions} onClick={() => updateEdit({ counter: plan, title: plan.title })}>Suggest a change</button>
            <button type="button" disabled={disableCardActions} onClick={() => submitCommand(plan, "pass")}>Pass</button>
          </>}
        </div>
      </> : plan.status === "ACCEPTED" ? <>
        {lockedUntil ? <p id={`${id}-completion`} className={styles.meta}>Mark done becomes available <time dateTime={lockedUntil}>{completionCalendar.format(new Date(lockedUntil))}</time>.</p> : null}
        <div className={styles.actions}>
          <button type="button" disabled={disableCardActions || Boolean(lockedUntil)} aria-describedby={lockedUntil ? `${id}-completion` : undefined} onClick={() => submitCommand(plan, "done")}>Mark done</button>
          <button type="button" disabled={disableCardActions} onClick={() => submitCommand(plan, "cancel")}>Cancel plan</button>
          {memoryAction}
        </div>
      </> : <>
        <p className={styles.meta}>{labels[plan.status]}{plan.resolvedBy ? ` · ${plan.resolvedBy}` : ""}</p>
        {plan.status === "DONE" || memoryAction ? <div className={styles.actions}>
          {memoryAction}
          {plan.status === "DONE" ? <button type="button" disabled={disableCardActions} onClick={() => submitCommand(plan, "undo-done")}>Undo done</button> : null}
        </div> : null}
      </>}
    </article>;
  }

  return <section className={styles.roadmap} aria-labelledby="simple-plans-title">
    <div className={styles.hero}>
      <h2 id="simple-plans-title">{plans.length ? "Our next steps" : "What would you like to do together?"}</h2>
      <p>Suggest something you’d both enjoy. Picking a day is optional.</p>
      {!edit ? <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => updateEdit({ counter: null, title: "" })}>Suggest a plan</button>
        {!plans.length ? presets.map(title => <button type="button" key={title} disabled={busy} onClick={() => updateEdit({ counter: null, title })}>{title}</button>) : null}
      </div> : null}
    </div>
    {edit ? <form className={styles.plan} onSubmit={send} key={edit.counter?.id ?? "new"}>
      <h3>{edit.counter ? "Suggest a change" : "Suggest a plan"}</h3>
      <label>Plan title<input name="title" disabled={busy} defaultValue={edit.title} required minLength={3} maxLength={120} onInput={event => event.currentTarget.setCustomValidity("")} /></label>
      <label>Day (optional)<input name="day" type="date" disabled={busy} min="1900-01-01" defaultValue={edit.counter?.day ?? ""} /></label>
      <label>Note (optional)<textarea name="note" rows={2} disabled={busy} maxLength={600} defaultValue={edit.counter?.note ?? ""} /></label>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>{edit.counter ? "Send change" : "Send suggestion"}</button>
        <button type="button" disabled={busy} onClick={() => { updateEdit(null); onDiscard(); }}>Cancel</button>
      </div>
    </form> : null}
    {inbox.length ? <section className={styles.group}><h3>Needs a reply</h3>{inbox.map(card)}</section> : null}
    {outgoing.length ? <section className={styles.group}><h3>Waiting for a reply</h3>{outgoing.map(card)}</section> : null}
    {upcoming.length ? <section className={styles.group}><h3>Coming up</h3>{upcoming.map(card)}</section> : null}
    {past.length ? <details ref={pastDetails} className={styles.group}><summary>Past plans</summary>{past.map(card)}</details> : null}
  </section>;
}
