"use client";

import { useState, type FormEvent } from "react";
import { memoryEnvelopeTones, type MemoryEnvelope, type MemoryEnvelopeFields, type MemoryEnvelopeTone, type MemoryPhoto } from "./memory-api";
import { MemoryThumbnail } from "./MemoryEnvelopes";
import memory from "./memories.module.scss";
import styles from "./envelopes.module.scss";

export function EnvelopeSettingsForm({ envelope, photos, busy, onCancel, onSave, onRemove }: {
  envelope?: MemoryEnvelope; photos: MemoryPhoto[]; busy: boolean; onCancel: () => void;
  onSave: (fields: MemoryEnvelopeFields, coverPhotoId: string | null) => void; onRemove: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (!title) {
      const field = event.currentTarget.elements.namedItem("title") as HTMLInputElement;
      field.setCustomValidity("Give your envelope a name.");
      field.reportValidity();
      return;
    }
    onSave({ title, day: String(data.get("day") ?? "") || null, tone: data.get("tone") as MemoryEnvelopeTone },
      String(data.get("cover") ?? "") || null);
  }
  return <form aria-labelledby="envelope-settings" className={memory.panel} onSubmit={submit}>
    <h2 id="envelope-settings">{envelope ? "Customize envelope" : "New envelope"}</h2>
    <label className={memory.field}>Envelope name<input name="title" required maxLength={65} disabled={busy} placeholder="The night we missed the train"
      defaultValue={envelope?.title} onInput={event => event.currentTarget.setCustomValidity("")} /></label>
    <label className={memory.field}>Date (optional)<input name="day" type="date" min="1900-01-01" max="9999-12-31" disabled={busy} defaultValue={envelope?.day ?? ""} /></label>
    <fieldset className={styles.picker}><legend>Paper color</legend>
      <div className={styles.swatches}>
        {Object.entries(memoryEnvelopeTones).map(([tone, label]) => <label className={styles.swatch} key={tone}>
          <input type="radio" name="tone" value={tone} disabled={busy} defaultChecked={(envelope?.tone ?? "CLAY") === tone} />
          <span className={styles.swatchDot} data-tone={tone} aria-hidden="true" />{label}
        </label>)}
      </div>
    </fieldset>
    {photos.length ? <label className={memory.field}>Cover photo
      <select name="cover" defaultValue={envelope?.coverPhotoId ?? ""} disabled={busy}>
        <option value="">Newest photo</option>
        {photos.map(photo => <option key={photo.id} value={photo.id}>{photo.title}</option>)}
      </select>
    </label> : null}
    <div className={memory.actions}>
      <button className={memory.primary} type="submit" disabled={busy}>{envelope ? "Save envelope" : "Create envelope"}</button>
      <button className={memory.link} type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      {envelope && !envelope.captions.length
        ? <button className={memory.link} type="button" disabled={busy} onClick={onRemove}>Remove envelope</button> : null}
    </div>
    {envelope?.captions.length ? <p className={memory.small}>Each person can remove their own caption from the back. An envelope can be removed once its back is blank.</p> : null}
  </form>;
}

export function EnvelopeTuckForm({ base, envelopes, destination, photos, initialPhotoId, busy, onCancel, onSave }: {
  base: string; envelopes: MemoryEnvelope[]; destination?: MemoryEnvelope; photos: MemoryPhoto[]; initialPhotoId?: string;
  busy: boolean; onCancel: () => void; onSave: (envelopeId: string, photoIds: string[]) => void;
}) {
  const [target, setTarget] = useState(destination?.id ?? (envelopes.length === 1 ? envelopes[0].id : ""));
  const [selection, setSelection] = useState(() => photos.filter(photo => photo.id === initialPhotoId).map(photo => photo.id));
  return <form aria-labelledby="envelope-tuck" className={memory.panel} onSubmit={event => {
    event.preventDefault();
    if (target && selection.length) onSave(target, selection);
  }}>
    <h2 id="envelope-tuck">Tuck in photos</h2>
    {destination ? <p>Into <strong>{destination.title}</strong></p> : <label className={memory.field}>Into envelope
      <select required value={target} disabled={busy} onChange={event => setTarget(event.currentTarget.value)}>
        <option value="">Choose an envelope</option>
        {envelopes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
    </label>}
    <fieldset className={styles.picker}><legend>Loose photos</legend>
      <div className={styles.photoGrid}>
        {photos.map(photo => <label className={styles.photoChoice} key={photo.id}>
          <MemoryThumbnail base={base} photo={photo} />
          <span className={styles.checkLabel}>
            <input type="checkbox" checked={selection.includes(photo.id)} disabled={busy} onChange={event => {
              const checked = event.currentTarget.checked;
              setSelection(current => checked ? [...current, photo.id] : current.filter(id => id !== photo.id));
            }} />
            {photo.title}
          </span>
        </label>)}
      </div>
    </fieldset>
    <p className={memory.small}>Their pins and recordings stay with them.</p>
    <div className={memory.actions}>
      <button type="submit" className={memory.primary} disabled={busy || !target || !selection.length}>
        {selection.length ? "Tuck in " + selection.length + (selection.length === 1 ? " photo" : " photos") : "Tuck in photos"}
      </button>
      <button type="button" className={memory.link} disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}

export function EnvelopeCaptionForm({ envelope, busy, onCancel, onSave }: {
  envelope: MemoryEnvelope; busy: boolean; onCancel: () => void; onSave: (text: string) => void;
}) {
  return <form aria-labelledby="envelope-caption" className={memory.panel} onSubmit={event => {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("caption") as HTMLTextAreaElement;
    const text = field.value.trim();
    if (!text) {
      field.setCustomValidity("Write something to keep on the back.");
      field.reportValidity();
    } else onSave(text);
  }}>
    <h2 id="envelope-caption">Your caption</h2>
    <label className={memory.field}>What do you remember?
      <textarea name="caption" rows={3} maxLength={160} required disabled={busy} defaultValue={envelope.captions.find(caption => caption.yours)?.text ?? ""}
        placeholder="One line about how you remember it…" onInput={event => event.currentTarget.setCustomValidity("")} />
    </label>
    <p className={memory.small}>Only you can edit this caption. It’s shared when you save.</p>
    <div className={memory.actions}>
      <button type="submit" className={memory.primary} disabled={busy}>Save caption</button>
      <button type="button" className={memory.link} disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
