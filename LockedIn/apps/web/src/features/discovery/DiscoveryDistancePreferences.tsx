"use client";

import { useId, useState } from "react";
import { discoveryRequest } from "./discovery.client";
import styles from "./discovery.module.scss";

export type DistancePreferences = { configured: boolean; preference: { maxDistanceMiles: number; areaLabel: string | null } | null };
type LocationOption = { label: string; token: string };
const endpoint = "/api/discovery/distance-preferences";
const ranges = [5, 10, 25, 50];

export default function DiscoveryDistancePreferences({ userId, initial, onSaved, onCancel }: {
  userId: string; initial: DistancePreferences; onSaved: (value: DistancePreferences) => void; onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [choice, setChoice] = useState<LocationOption | null>(null);
  const [miles, setMiles] = useState(initial.preference?.maxDistanceMiles ?? 25);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const rangeId = useId();
  const rangeHint = `${rangeId}-hint`;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const find = () => void run(async () => {
    setLocations([]);
    setChoice(null);
    const result = await discoveryRequest<{ locations: LocationOption[] }>(userId, `${endpoint}/locations`, { method: "POST", body: JSON.stringify({ query }) });
    setLocations(result.locations);
    if (result.locations.length) {
      setQuery("");
      setMessage("Choose a location below.");
    } else {
      setMessage("No locations found. Try adding a city or country to your search.");
    }
  });
  const save = () => void run(async () => {
    onSaved(await discoveryRequest<DistancePreferences>(userId, endpoint, {
      method: "PUT", body: JSON.stringify({ maxDistanceMiles: miles, ...(choice ? { locationToken: choice.token } : {}) }),
    }));
  });
  const remove = () => void run(async () => {
    onSaved(await discoveryRequest<DistancePreferences>(userId, endpoint, { method: "DELETE" }));
  });
  const chooseLocation = locations.length > 0 || !!choice || !!query.trim();
  return <section className={`${styles.card} ${styles.form}`} aria-label="Distance preferences">
    <h2>Distance preferences</h2>
    {initial.preference ? <p>Saved search location: {initial.preference.areaLabel ?? "Approximate area"}</p> : null}
    {initial.configured ? <>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); if (query.trim().length >= 3) find(); }}>
        <label>Search location<input autoComplete="off" maxLength={160} value={query} disabled={busy} onChange={event => { setQuery(event.target.value); setChoice(null); setLocations([]); setMessage(""); setError(""); }}/></label>
        <p className={styles.muted}>Enter a city, neighborhood, postal code, or address. Add a country to narrow your search. A home address isn’t required. Geoapify looks up what you enter; LockedIn saves only an approximate location and a broad place name when available. Other people see only the city you publish.</p>
        <button type="submit" disabled={busy || query.trim().length < 3}>Find location</button>
      </form>
      {locations.length ? <fieldset disabled={busy} className={styles.editorFields}>
        <legend>Choose a search location</legend>
        {locations.map((location, i) => <label key={location.token} className={styles.check}><input type="radio" name="discovery-location" value={i} checked={choice?.token === location.token} onChange={() => setChoice(location)}/><span>{location.label}</span></label>)}
      </fieldset> : null}
    </> : <p>New location lookups are unavailable right now.</p>}
    {initial.configured || initial.preference ? <p className={styles.muted}>Powered by <a href="https://www.geoapify.com/">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · <a href="https://www.geoapify.com/products-and-services/">Other data sources</a></p> : null}
    <div className={styles.form}>
      <label htmlFor={rangeId}>Maximum distance</label>
      <select id={rangeId} aria-describedby={rangeHint} value={miles} disabled={busy} onChange={event => setMiles(Number(event.target.value))}>
        {ranges.map(range => <option key={range} value={range}>{range} mi</option>)}
      </select>
    </div>
    <p id={rangeHint} className={styles.muted}>You’ll only see each other if you’re within both people’s ranges. Distance is measured in a straight line, not by travel time.</p>
    {message ? <p role="status">{message}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={busy || (!choice && (!initial.preference || chooseLocation))} onClick={save}>Save preferences</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
    {initial.preference ? <button type="button" disabled={busy} onClick={remove}>Remove search location and browse by city</button> : null}
  </section>;
}
