import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { datePlanTimeInput, getDateFields } from "./date-plan-time";
import type { DatePlanTimeInput } from "./date-plans.types";
import styles from "./chat.module.scss";

export function DatePlanDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = panel.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>('input[type="date"]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return <dialog ref={panel} className={styles.planDialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className={styles.planDialogTitle}><h3 id={titleId}>{title}</h3><button type="button" onClick={onClose}>Close</button></div>
    {children}
  </dialog>;
}

export default function DatePlanForm({ venueName, startsAt, busy, onSubmit }: {
  venueName: string; startsAt?: string; busy: boolean; onSubmit: (time: DatePlanTimeInput) => Promise<void>;
}) {
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [date, setDate] = useState(() => startsAt ? getDateFields(new Date(startsAt), zone).date : "");
  const [time, setTime] = useState(() => startsAt ? getDateFields(new Date(startsAt), zone).time : "");
  const [changingZone, setChangingZone] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const timeZones = useMemo(() => [...new Set(["UTC", zone, ...(Intl.supportedValuesOf?.("timeZone") ?? [])])].sort(), [zone]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { field.current?.focus(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!alive.current || busy || checking) return;
    setChecking(true);
    setError("");
    try {
      const payload = await datePlanTimeInput(date + "T" + time, zone);
      if (!alive.current) return;
      if (!payload) {
        setError("Choose a time in the next 90 days that isn’t skipped or repeated by a clock change.");
        return;
      }
      await onSubmit(payload);
    } catch {
      if (alive.current) setError("Could not check that time. Please try again.");
    } finally {
      if (alive.current) setChecking(false);
    }
  }

  return <form className={styles.form} onSubmit={submit}>
    <p className={styles.venueName}>{venueName}</p>
    <div className={styles.planFields}>
      <label>Day<input type="date" ref={field} value={date} min={getDateFields(new Date(), zone).date} required onChange={event => setDate(event.target.value)}/></label>
      <label>Time<input type="time" value={time} required onChange={event => setTime(event.target.value)}/></label>
    </div>
    {changingZone ? <label>Time zone<select value={zone} onChange={event => setZone(event.target.value)}>
      {timeZones.map(item => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}
    </select></label> : <div className={styles.planActions}>
      <span className={styles.muted}>Time zone: {zone.replaceAll("_", " ")}</span>
      <button className={styles.quietAction} type="button" onClick={() => setChangingZone(true)}>Change time zone</button>
    </div>}
    {error ? <p role="alert">{error}</p> : null}
    <button className={styles.primary} type="submit" disabled={!date || !time || checking || busy}>{checking || busy ? "Sending…" : "Send suggestion"}</button>
  </form>;
}
