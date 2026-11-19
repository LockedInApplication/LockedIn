"use client";

import { useState } from "react";
import type { VenueDetails } from "./date-spots.types";
import styles from "./date-spots.module.scss";

export function PlaceCredits() {
  return <small className={styles.credits}>Place data by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></small>;
}

export default function DateSpotVenue({ venue, reason, busy, onBack, onShare }: {
  venue: VenueDetails; reason?: string; busy: boolean; onBack: () => void; onShare?: () => void;
}) {
  const [index, setIndex] = useState(0), [failed, setFailed] = useState<string[]>([]);
  const photos = venue.photos.filter(photo => !failed.includes(photo.url));
  const photo = photos[index % Math.max(photos.length,1)];
  return <section className={styles.detail} aria-label="Venue details">
    <div><button type="button" onClick={onBack} disabled={busy}>← Back</button></div>
    <h3>{venue.name}</h3>
    {photo ? <figure className={styles.photo}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Wikimedia provides an attributed, sized thumbnail; do not proxy it through Next. */}
      <img src={photo.url} alt={`Photo of ${venue.name}`} referrerPolicy="no-referrer" onError={() => setFailed(values => [...values,photo.url])}/>
      <figcaption><a href={photo.source} target="_blank" rel="noreferrer">{photo.author}</a> · {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a> : photo.license}</figcaption>
      {photos.length > 1 ? <button type="button" onClick={() => setIndex(i => (i + 1) % photos.length)}>Next photo · {(index % photos.length) + 1} of {photos.length}</button> : null}
    </figure> : <p className={styles.muted}>No venue photos available.</p>}
    {reason ? <p>{reason}</p> : null}
    {venue.address ? <p><strong>Address:</strong> {venue.address}</p> : null}
    {venue.hours.length ? <details><summary>Listed hours</summary><ul>{venue.hours.map((hours,index) => <li key={index}>{hours}</li>)}</ul><p className={styles.muted}>Check with the venue before you go.</p></details> : null}
    <div className={styles.actions}>
      <a href={venue.mapsUrl} target="_blank" rel="noreferrer">View on map</a>
      {venue.website ? <a href={venue.website} target="_blank" rel="noreferrer">Venue website</a> : null}
      {onShare ? <button type="button" className={styles.primary} onClick={onShare} disabled={busy}>{busy ? "Sharing…" : "Share in chat"}</button> : null}
    </div>
    <PlaceCredits/>
  </section>;
}
