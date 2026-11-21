"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { JourneyApiError } from "@/lib/journey";
import DiscoveryShell, { useDiscovery } from "./DiscoveryShell";
import { discoveryRequest } from "./discovery.client";
import type { DiscoveryMatchGender, DiscoveryMatchPreferencesView } from "./discovery.types";
import { useDiscoveryResource } from "./use-discovery-resource";
import styles from "./discovery.module.scss";

const apiPath = "/api/discovery/match-preferences";
const genders: Record<DiscoveryMatchGender, string> = { WOMAN: "Woman", MAN: "Man", NONBINARY: "Nonbinary", ANOTHER_GENDER: "Another gender" };
const options = Object.entries(genders) as [DiscoveryMatchGender, string][];
const youngestAdult = 18;
const oldestSelectableAge = 120;
const ageOptions = Array.from({ length: oldestSelectableAge - youngestAdult + 1 }, (_, index) => youngestAdult + index);

export default function DiscoveryMatchPreferences({ onCancel, onSaved }: { onCancel?: () => void; onSaved: (value: DiscoveryMatchPreferencesView) => void }) {
  const { userId, me } = useDiscovery();
  const load = useCallback((signal: AbortSignal) => discoveryRequest<DiscoveryMatchPreferencesView>(userId, apiPath, { signal }), [userId]);
  const key = `matching:${me.matching?.revision ?? (me.matching ? "setup" : "off")}`;
  const resource = useDiscoveryResource(userId, key, load);
  const value = resource.value;
  if (resource.error) return <section className={styles.card} role="alert"><p>{resource.error}</p><div className={styles.actions}><button onClick={resource.retry}>Try again</button>{onCancel?<button onClick={onCancel}>Back</button>:null}</div></section>;
  if (!value) return <p role="status">Opening matching preferences…</p>;
  if (!value.settings && (!value.required || !me.canDiscover)) return <section className={styles.card}><p>Matching setup is unavailable right now.</p>{onCancel?<button onClick={onCancel}>Back</button>:null}</section>;
  return <MatchingEditor key={`${userId}:${value.settings?.revision ?? "new"}:${value.required}`} initial={value} canEdit={value.required && me.canDiscover} onCancel={onCancel} onReload={resource.retry} onSaved={next=>{resource.install(next);onSaved(next);}}/>;
}

export function DiscoveryMatchPreferencesPage() {
  return <DiscoveryShell><AccountMatchingEditor/></DiscoveryShell>;
}

function AccountMatchingEditor() {
  const { leave } = useDiscovery();
  const [notice,setNotice] = useState("");
  return <><button type="button" onClick={()=>void leave("/profile")}>← Profile &amp; settings</button><h1>Discovery matching</h1>
    {notice?<p role="status" className={styles.notice}>{notice}</p>:null}
    {!notice?<DiscoveryMatchPreferences onCancel={()=>void leave("/profile")} onSaved={value=>setNotice(value.settings?"Matching preferences saved.":"Matching setup removed. Existing chats and direct invites are unchanged.")}/>:null}
  </>;
}

export function MatchingEditor({ initial, canEdit, onCancel, onReload, onSaved }: { initial: DiscoveryMatchPreferencesView; canEdit: boolean; onCancel?: () => void; onReload?: () => void; onSaved: (next: DiscoveryMatchPreferencesView) => void }) {
  const { userId, busy, setBusy, installMatching } = useDiscovery();
  const settings = initial.settings;
  const heading = useId();
  const [birthDate, setBirthDate] = useState(settings?.birthDate ?? "");
  const [gender, setGender] = useState<DiscoveryMatchGender | "">(settings?.gender ?? "");
  const [meet, setMeet] = useState<"all" | DiscoveryMatchGender[]>(settings?.meetGenders ?? []);
  const [ageChoice, setAgeChoice] = useState<"" | "any" | "range">(settings ? settings.maxAge === null ? "any" : "range" : "");
  const [minimum, setMinimum] = useState(settings?.maxAge == null ? "" : String(settings.minAge));
  const [maximum, setMaximum] = useState(settings?.maxAge == null ? "" : String(settings.maxAge));
  const [confirmed, setConfirmed] = useState(false);
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState("");
  const [canReload, setCanReload] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(()=>()=>{request.current?.abort();},[]);
  const birthDateChanged = settings ? settings.birthDate !== birthDate : initial.requiresBirthDateConfirmation === true;
  const minAge = Number(minimum);
  const maxAge = Number(maximum);
  const validRange = Number.isInteger(minAge) && Number.isInteger(maxAge) && minAge >= youngestAdult && maxAge <= oldestSelectableAge && minAge <= maxAge;
  const ready = !!birthDate && !!gender && meet.length > 0 && (ageChoice === "any" || ageChoice === "range" && validRange) && (!birthDateChanged || confirmed);

  async function update(method: "PUT" | "DELETE", body?: object) {
    if (busy || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setCanReload(false);
    try {
      const next = await discoveryRequest<DiscoveryMatchPreferencesView>(userId, apiPath, { method, signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!controller.signal.aborted) { installMatching(next); onSaved(next); }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Could not update your matching preferences.");
        setCanReload(cause instanceof JourneyApiError && cause.status === 409);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      request.current = null;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    void update("PUT", { revision: settings?.revision ?? null, birthDate, gender, meetGenders: meet, minAge: ageChoice === "any" ? youngestAdult : minAge, maxAge: ageChoice === "any" ? null : maxAge, ...(birthDateChanged && confirmed ? { confirmBirthDateChange: true } : {}) });
  }

  return <section className={styles.card} aria-labelledby={heading}>
    <h2 id={heading}>{settings ? "Matching preferences" : "Set up private matching"}</h2>
    <p>{canEdit ? "You’ll only see people who fit your preferences and whose preferences you fit. Your birthday and choices won’t appear on your profile." : "New matching settings are unavailable. You can still remove what you saved."}</p>
    {error?<p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>:null}
    {canReload&&onReload?<button type="button" disabled={busy} onClick={onReload}>Reload saved preferences</button>:null}
    {canEdit?<form className={`${styles.form} ${styles.matchForm}`} onSubmit={submit}>
      <fieldset className={styles.editorFields} disabled={busy}>
        <label className={styles.matchField}>Date of birth<input type="date" autoComplete="bday" required value={birthDate} onChange={event=>{setBirthDate(event.target.value);setConfirmed(false);}}/></label>
        {birthDateChanged?<label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Confirm this birthday (one correction every 30 days)</label>:null}
        <div className={styles.matchField}>
          <label htmlFor={`${heading}-gender`}>How you identify for matching</label>
          <select id={`${heading}-gender`} required value={gender} onChange={event=>setGender(event.target.value as DiscoveryMatchGender|"")}><option value="">Select one</option>{options.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
        </div>
        <fieldset className={styles.rangeField}>
          <legend>Who you’re open to meeting</legend>
          <label className={`${styles.check} ${styles.matchAll}`}><input type="checkbox" checked={meet === "all"} onChange={event=>setMeet(event.target.checked?"all":[])}/>Open to all genders</label>
          <div className={`${styles.rangeOptions} ${styles.matchGenderOptions}`}>{options.map(([key,label])=><label key={key}><input type="checkbox" disabled={meet === "all"} checked={meet === "all" || meet.includes(key)} onChange={event=>setMeet(current=>current === "all" ? current : event.target.checked ? [...current,key] : current.filter(value=>value!==key))}/><span>{label}</span></label>)}</div>
        </fieldset>
        <fieldset className={styles.rangeField}>
          <legend>Age preference</legend>
          <div className={styles.rangeOptions}>
            <label><input type="radio" name={`${heading}-age`} checked={ageChoice === "any"} onChange={()=>setAgeChoice("any")}/><span>Any adult age</span></label>
            <label><input type="radio" name={`${heading}-age`} checked={ageChoice === "range"} onChange={()=>setAgeChoice("range")}/><span>Choose an age range</span></label>
          </div>
          {ageChoice === "range"?<div className={styles.matchAges}>
            <label>Youngest age<select required value={minimum} onChange={event=>{
              const next = event.target.value;
              setMinimum(next);
              if (maximum && maxAge < Number(next)) setMaximum("");
            }}><option value="">Select age</option>{ageOptions.map(age=><option key={age} value={age}>{age}</option>)}</select></label>
            <label>Oldest age<select required value={maximum} onChange={event=>setMaximum(event.target.value)}>
              <option value="">Select age</option>{ageOptions.filter(age=>age >= minAge).map(age=><option key={age} value={age}>{age}</option>)}
            </select></label>
          </div>:null}
        </fieldset>
      </fieldset>
      <div className={`${styles.actions} ${styles.matchActions}`}><button className={styles.primary} type="submit" disabled={busy || !ready}>{settings ? "Save matching preferences" : "Save and continue"}</button>{onCancel?<button type="button" onClick={onCancel} disabled={busy}>Cancel</button>:null}</div>
    </form>:onCancel?<button onClick={onCancel} disabled={busy}>Back</button>:null}
    {settings?<div className={`${styles.actions} ${styles.matchRemove}`}><button className={styles.danger} type="button" disabled={busy} onClick={()=>setRemove(true)}>Remove matching setup</button></div>:null}
    <ConfirmDialog open={remove} title="Remove your matching setup?" description="Your birthday and matching choices will be deleted. When matching is required, you’ll stop appearing in Discover until you set it up again. Existing chats and direct invites still work." confirmLabel="Remove setup" cancelLabel="Keep preferences" onCancel={()=>setRemove(false)} onConfirm={()=>{setRemove(false);void update("DELETE");}}/>
  </section>;
}
