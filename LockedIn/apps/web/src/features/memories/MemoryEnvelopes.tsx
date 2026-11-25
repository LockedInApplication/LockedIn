"use client";

import { useEffect, useRef, useState } from "react";
import { memoryPhotoPath, type MemoryEnvelope, type MemoryPhoto } from "./memory-api";
import { usePrivateAsset } from "./PrivateMemoryMedia";
import memory from "./memories.module.scss";
import styles from "./envelopes.module.scss";

const calendar = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const dayLabel = (day: string) => calendar.format(new Date(day + "T12:00:00Z"));
const countPhotos = (count: number) => count + (count === 1 ? " photo" : " photos");

export function MemoryThumbnail({ base, photo, className, eager = false }: { base: string; photo: Pick<MemoryPhoto, "id">; className?: string; eager?: boolean }) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (eager || visible || !element.current) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "140px" });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [eager, visible]);
  const asset = usePrivateAsset(memoryPhotoPath(base, photo.id) + "/thumbnail", "", eager || visible);
  return <span className={[styles.thumb, className].filter(Boolean).join(" ")} ref={element} aria-hidden="true">
    {/* Private object URLs must not use the public Next image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {asset.url ? <img src={asset.url} alt="" draggable={false} /> : null}
  </span>;
}

function EnvelopeArtwork({ base, envelope, photos, open = false }: { base: string; envelope: MemoryEnvelope; photos: MemoryPhoto[]; open?: boolean }) {
  const cover = photos.find(photo => photo.id === envelope.coverPhotoId) ?? photos[0];
  return <span className={styles.artWell} aria-hidden="true">
    <span className={styles.envelope} data-tone={envelope.tone} data-open={open || undefined}>
      <span className={styles.envelopeBase} />
      {photos.length > 1 ? <span className={styles.extraPrint} /> : null}
      {cover ? <MemoryThumbnail base={base} photo={cover} className={styles.print} /> : null}
      <span className={styles.pocket} />
      <span className={styles.flap} />
      {!open ? <span className={styles.seal}>✦</span> : null}
      <span className={styles.address}>for us</span>
    </span>
  </span>;
}

export function MemoryPhotoGrid({ base, photos, disabled, onOpen }: {
  base: string; photos: MemoryPhoto[]; disabled: boolean; onOpen: (photo: MemoryPhoto) => void;
}) {
  return <div className={styles.photoGrid}>
    {photos.map(photo => (
      <button type="button" className={styles.photoCard} key={photo.id} disabled={disabled}
        onClick={() => onOpen(photo)} aria-label={"Open " + photo.title}>
        <MemoryThumbnail base={base} photo={photo} />
        <span className={styles.cardCopy}>
          <strong>{photo.title}</strong>
          <span className={memory.small}>{photo.pins.length ? photo.pins.length + (photo.pins.length === 1 ? " pinned detail" : " pinned details") : "Shared photo"}</span>
        </span>
      </button>
    ))}
  </div>;
}

export function MemoryEnvelopeShelf({ base, envelopes, photos, busy, onCreate, onUpload, onOpen, onPhoto }: {
  base: string; envelopes: MemoryEnvelope[]; photos: MemoryPhoto[]; busy: boolean;
  onCreate: () => void; onUpload: () => void; onOpen: (id: string) => void; onPhoto: (photo: MemoryPhoto) => void;
}) {
  const loose = photos.filter(photo => !photo.envelopeId);
  return <>
    <div className={memory.actions}>
      <button className={memory.primary} type="button" disabled={busy} onClick={onCreate}>New envelope</button>
      <button className={memory.secondary} type="button" disabled={busy} onClick={onUpload}>Add a photo</button>
    </div>
    <section className={styles.section} aria-labelledby="memory-shelf-title">
      <div className={styles.sectionHeading}><h2 id="memory-shelf-title">On your shelf</h2></div>
      {envelopes.length ? <div className={styles.shelf}>
        {envelopes.map(envelope => {
          const contents = photos.filter(photo => photo.envelopeId === envelope.id);
          return <button key={envelope.id} type="button" className={styles.shelfCard} disabled={busy}
            onClick={() => onOpen(envelope.id)} aria-label={"Open envelope " + envelope.title}>
            <EnvelopeArtwork base={base} envelope={envelope} photos={contents} />
            <span className={styles.cardCopy}>
              <strong>{envelope.title}</strong>
              <span className={memory.small}>{envelope.day ? dayLabel(envelope.day) + " · " : ""}{countPhotos(contents.length)}</span>
            </span>
          </button>;
        })}
      </div> : <p className={memory.empty}>Make an envelope for a memory you want to keep together.</p>}
    </section>
    <section className={styles.section} aria-labelledby="memory-loose-title">
      <div className={styles.sectionHeading}><h2 id="memory-loose-title">Loose photos</h2><span className={memory.small}>{countPhotos(loose.length)}</span></div>
      {loose.length
        ? <MemoryPhotoGrid base={base} photos={loose} disabled={busy} onOpen={onPhoto} />
        : <p className={memory.small}>Photos you add without an envelope will show up here.</p>}
    </section>
  </>;
}

export function MemoryEnvelopeContents({ base, envelope, photos, busy, looseCount, onUpload, onTuck, onFlip, onPhoto }: {
  base: string; envelope: MemoryEnvelope; photos: MemoryPhoto[]; busy: boolean; looseCount: number;
  onUpload: () => void; onTuck: () => void; onFlip: () => void; onPhoto: (photo: MemoryPhoto) => void;
}) {
  return <>
    <section className={styles.openEnvelope} aria-labelledby="memory-envelope-title">
      <div className={styles.envelopeHeading}>
        <p className={memory.eyebrow}>Envelope / Front</p>
        <h2 id="memory-envelope-title">{envelope.title}</h2>
        <p className={memory.small}>{envelope.day ? dayLabel(envelope.day) + " · " : ""}{countPhotos(photos.length)}</p>
        <div className={memory.actions}>
          <button type="button" className={memory.primary} disabled={busy} onClick={onUpload}>Add a photo</button>
          <button type="button" className={memory.secondary} disabled={busy || !looseCount} onClick={onTuck}>Tuck in photos</button>
          <button type="button" className={memory.link} disabled={busy} onClick={onFlip}>Flip to captions</button>
        </div>
      </div>
      <EnvelopeArtwork base={base} envelope={envelope} photos={photos} open />
    </section>
    <section className={styles.section} aria-labelledby="memory-envelope-photos">
      <div className={styles.sectionHeading}><h3 id="memory-envelope-photos">Photos inside</h3><span className={memory.small}>{countPhotos(photos.length)}</span></div>
      {photos.length
        ? <MemoryPhotoGrid base={base} photos={photos} disabled={busy} onOpen={onPhoto} />
        : <p className={memory.empty}>Nothing tucked in yet.</p>}
    </section>
  </>;
}

export function MemoryEnvelopeBack({ envelope, partnerName, busy, onEdit, onRemove }: {
  envelope: MemoryEnvelope; partnerName: string; busy: boolean; onEdit: () => void; onRemove: () => void;
}) {
  const mine = envelope.captions.find(caption => caption.yours);
  const theirs = envelope.captions.find(caption => !caption.yours);
  return <section className={styles.postcard} data-tone={envelope.tone} aria-labelledby="memory-envelope-back">
    <header className={styles.postcardHead}>
      <div><p className={memory.eyebrow}>Envelope / Back</p><h2 id="memory-envelope-back">{envelope.title}</h2></div>
      <span className={styles.stamp} aria-hidden="true">✦</span>
    </header>
    <div className={styles.captions}>
      <article className={styles.caption}>
        <p className={memory.eyebrow}>Your caption</p>
        {mine ? <blockquote>“{mine.text}”</blockquote> : <p className={memory.small}>Nothing written yet.</p>}
        <div className={memory.actions}>
          <button type="button" className={memory.secondary} disabled={busy} onClick={onEdit}>{mine ? "Edit your caption" : "Write your caption"}</button>
          {mine ? <button type="button" className={memory.link} disabled={busy} onClick={onRemove}>Remove your caption</button> : null}
        </div>
      </article>
      <article className={styles.caption}>
        <p className={memory.eyebrow}>{partnerName}’s caption</p>
        {theirs ? <blockquote>“{theirs.text}”</blockquote> : <p className={memory.small}>Nothing written yet.</p>}
      </article>
    </div>
  </section>;
}
