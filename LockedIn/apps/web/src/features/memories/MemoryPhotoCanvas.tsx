"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { nearestPin, photoPoint, type MemoryPhoto, type PhotoPoint } from "./memory-api";
import { usePrivateAsset } from "./PrivateMemoryMedia";
import styles from "./memories.module.scss";

const coordinateStyle = ({ x, y }: PhotoPoint) => ({ "--pin-x": `${x / 100}%`, "--pin-y": `${y / 100}%` } as CSSProperties);

export function MemoryPhotoCanvas({ photo, path, selected, placing, draftPoint, disabled, partnerName, onPlace, onSelect }: {
  photo: MemoryPhoto;
  path: string;
  selected: string | null;
  placing: boolean;
  draftPoint: PhotoPoint | null;
  disabled: boolean;
  partnerName: string;
  onPlace: (point: PhotoPoint, existingPin?: string) => void;
  onSelect: (id: string) => void;
}) {
  const [showPins, setShowPins] = useState(true);
  const asset = usePrivateAsset(`${path}/media`);
  const placer = useRef<HTMLButtonElement>(null);
  const [cursor, setCursor] = useState<PhotoPoint>({ x: 2000, y: 6800 });
  useEffect(() => { if (placing && asset.url) placer.current?.focus({ preventScroll: true }); }, [placing, asset.url]);
  const showMarker = placing || Boolean(draftPoint);
  return <figure className={styles.photo}>
    <div className={styles.canvas} style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
      {asset.url ? <>
        {/* The source is a private object URL, not an image for the public optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={photo.title} width={photo.width} height={photo.height} />
        {(showPins || placing) ? <div className={styles.pinLayer} role="group" aria-label="Pinned details on the photo">
          {photo.pins.map((pin, index) => <button className={styles.pin} type="button" key={pin.id} style={coordinateStyle(pin)}
            aria-label={`Pin ${index + 1}: ${pin.title}${pin.notes.some(note => note.voiceDurationMs) ? " · Voice note" : ""}`}
            data-voice={pin.notes.some(note => note.voiceDurationMs) || undefined}
            aria-pressed={selected === pin.id} disabled={disabled} onClick={() => onSelect(pin.id)}>
            <span aria-hidden="true">{index + 1}</span>
          </button>)}
        </div> : null}
        {placing ? <button type="button" ref={placer} className={styles.placer} aria-label="Place a pin on the photo" aria-describedby="memory-spot-instructions"
          onKeyDown={event => {
            const delta = event.shiftKey ? 1200 : 450;
            const offsets: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
            const value = offsets[event.key];
            if (!value) return;
            event.preventDefault();
            const edge = (n: number) => Math.min(9600, Math.max(400, n));
            setCursor(point => ({ x: edge(point.x + value[0]), y: edge(point.y + value[1]) }));
          }}
          onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            const point = event.detail ? photoPoint(event.clientX, event.clientY, rect) : cursor;
            onPlace(point, nearestPin(point, photo.pins, rect)?.id);
          }}
        /> : null}
        {showMarker ? <span className={styles.marker} style={coordinateStyle(draftPoint ?? cursor)} aria-hidden="true">+</span> : null}
      </> : asset.failed ? <p className={styles.assetFallback}>Couldn’t load the photo. <button type="button" className={styles.link} onClick={asset.retry}>Try again</button></p>
        : <p className={styles.assetFallback} role="status">Opening photo…</p>}
    </div>
    <figcaption className={styles.photoCaption}>
      <span>Photo by {photo.yours ? "you" : partnerName}</span>
      {asset.url && photo.pins.length > 0 ? <button type="button" className={styles.link} disabled={disabled} aria-pressed={!showPins} onClick={() => setShowPins(value => !value)}>{showPins ? "Hide pins" : "Show pins"}</button> : null}
    </figcaption>
  </figure>;
}
