"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { JourneyApiError, journeyRequest } from "@/features/journey/journey.client";
import { useQuietRefresh } from "@/features/notifications/use-quiet-refresh";
import { MemoryPhotoCanvas } from "./MemoryPhotoCanvas";
import { MemoryVoiceDraft } from "./MemoryVoiceDraft";
import { MemoryVoicePlayer } from "./PrivateMemoryMedia";
import {
  changeMemory, maxMemoryPhotoBytes, memoryNotePath, memoryPath, memoryPhotoPath, memoryPhotoTypes, memoryVoicePath,
  type Memories, type MemoryPhoto, type MemoryPin, type PhotoPoint,
} from "./memory-api";
import styles from "./memories.module.scss";

type Format = "voice" | "text";
type NoteDraft = {
  type: "note"; photoId: string; format: Format; text: string; clip: Blob | null; title: string;
  target: { pinId: string } | { id: string; point: PhotoPoint };
};
type Draft = { type: "photo"; id: string; title: string; file: File | null }
  | { type: "place"; photoId: string } | NoteDraft | null;
type Removal = { photoId: string } | { photoId: string; pinId: string; part: Format };

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function BehindThePhoto({ relationshipId, userId, partnerName, revision, onDirty, onExpired }: {
  relationshipId: string; userId: string; partnerName: string; revision: number;
  onDirty: (value: boolean) => void; onExpired: () => void;
}) {
  const base = memoryPath(relationshipId);
  const [gallery, setGallery] = useState<Memories | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [pinId, setPinId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const draftRef = useRef<Draft>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [recording, setRecording] = useState(false);
  const [removal, setRemoval] = useState<Removal | null>(null);

  const read = useCallback((signal: AbortSignal) => journeyRequest<Memories>(base, { signal, cache: "no-store" }), [base]);
  const apply = useCallback((data: Memories) => { setGallery(data); setLoadError(""); }, []);
  const readFailed = useCallback((cause: unknown) => {
    if (cause instanceof JourneyApiError && cause.status === 401) onExpired();
    if (cause instanceof JourneyApiError && [401, 403, 404].includes(cause.status)) setGallery(null);
    setLoadError(cause instanceof JourneyApiError && cause.status === 404
      ? "Behind the Photo isn’t available in this space." : "Couldn’t load your photos.");
  }, [onExpired]);
  const { invalidate, setBlocked } = useQuietRefresh(read, apply, readFailed);
  useEffect(() => { invalidate(); }, [invalidate, revision]);
  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === "visible") invalidate(); };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    // Also works when the two people are connected to different API instances.
    const timer = window.setInterval(refreshVisible, 30_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [invalidate]);

  const photo = gallery?.photos.find(item => item.id === photoId) ?? gallery?.photos[0];
  const pin = photo?.pins.find(item => item.id === pinId) ?? photo?.pins[0];
  const url = photo ? memoryPhotoPath(base, photo.id) : "";
  const isPlacing = draft?.type === "place";
  const note = draft?.type === "note" ? draft : null;
  const targetPinId = note && "pinId" in note.target ? note.target.pinId : null;
  const draftPoint = note && "point" in note.target ? note.target.point : null;

  function changeDraft(value: Draft) {
    draftRef.current = value;
    setDraft(value);
    setBlocked(Boolean(value) || pending.current);
    onDirty(Boolean(value));
    setError("");
    if (value === null) setRecording(false);
  }
  function updateNote(update: Partial<Pick<NoteDraft, "text" | "title" | "clip" | "format">>) {
    const current = draftRef.current;
    if (current?.type === "note") changeDraft({ ...current, ...update });
  }
  function beginNote(activePhoto: MemoryPhoto, activePin: MemoryPin, format: Format) {
    setNotice("");
    changeDraft({
      type: "note", photoId: activePhoto.id, format, target: { pinId: activePin.id }, title: activePin.title, clip: null,
      text: activePin.notes.find(entry => entry.yours)?.text ?? "",
    });
  }
  function selectPin(id: string) {
    setPinId(id);
    setNotice("");
    setError("");
  }
  async function run(operation: () => Promise<void>, success: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setBlocked(true);
    setError("");
    setNotice("");
    try {
      await operation();
      changeDraft(null);
      setNotice(success);
    } catch (cause) {
      if (cause instanceof JourneyApiError && cause.status === 401) onExpired();
      setError(message(cause, "Couldn’t save this change. Try again."));
    } finally {
      pending.current = false;
      setBusy(false);
      setBlocked(Boolean(draftRef.current));
      invalidate();
    }
  }
  function submitPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft?.type !== "photo") return;
    if (!draft.title.trim() || !draft.file) { setError("Name the memory and choose a photo."); return; }
    const body = new FormData();
    body.set("id", draft.id);
    body.set("title", draft.title.trim());
    body.set("file", draft.file);
    void run(async () => {
      const added = await changeMemory<{ id: string }>(base, "POST", userId, body);
      setPhotoId(added.id);
      setPinId(null);
    }, `Photo shared with ${partnerName}.`);
  }
  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note || recording) return;
    const body = new FormData();
    if (note.format === "voice") {
      if (!note.clip) { setError("Record a voice note before sharing."); return; }
      body.set("voice", note.clip, "memory.wav");
    } else {
      if (!note.text.trim()) { setError("Write a short note before sharing."); return; }
      body.set("text", note.text.trim());
    }
    const target = note.target;
    const photoUrl = memoryPhotoPath(base, note.photoId);
    if ("pinId" in target) {
      void run(async () => {
        await changeMemory(memoryNotePath(photoUrl, target.pinId), "PUT", userId, body);
        setPinId(target.pinId);
      }, `${note.format === "voice" ? "Voice note" : "Note"} shared with ${partnerName}.`);
    } else {
      if (!note.title.trim()) { setError("Give this detail a short name."); return; }
      body.set("id", target.id);
      body.set("title", note.title.trim());
      body.set("x", String(target.point.x));
      body.set("y", String(target.point.y));
      void run(async () => {
        const added = await changeMemory<{ id: string }>(`${photoUrl}/pins`, "POST", userId, body);
        setPinId(added.id);
      }, "Detail pinned to your photo.");
    }
  }

  return <section className={styles.memory} aria-labelledby="behind-the-photo-heading" onPlay={event => {
    const player = event.target;
    if (player instanceof HTMLAudioElement) event.currentTarget.querySelectorAll("audio").forEach(other => {
      if (player !== other) other.pause();
    });
  }}>
    <header className={styles.heading}>
      <div>
        <p className={styles.eyebrow}>Together / Memories</p>
        <h1 id="behind-the-photo-heading">Behind the <em>Photo.</em></h1>
        <p>Save a photo. Tap a detail and leave the part of the story you remember.</p>
      </div>
      <span className={styles.private}>Only you and {partnerName}</span>
    </header>
    {notice ? <p className={styles.status} role="status">{notice}</p> : null}
    {loadError ? <p className={styles.error} role="alert">{loadError} <button type="button" className={styles.link} onClick={invalidate}>Try again</button></p> : null}
    {!gallery && !loadError ? <p className={styles.small} role="status">Opening your photos…</p> : null}
    {gallery ? <>
      <div className={styles.toolbar}>
        {gallery.photos.length > 1 ? <label className={styles.field}>Your photos
          <select disabled={busy || !!draft} value={photo?.id ?? ""} onChange={event => { setPhotoId(event.target.value); setPinId(null); setNotice(""); setError(""); }}>
            {gallery.photos.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label> : null}
        <button type="button" className={photo ? styles.secondary : styles.primary} disabled={busy || !!draft} onClick={() => {
          setNotice("");
          changeDraft({ type: "photo", id: crypto.randomUUID(), title: "", file: null });
        }}>Add a photo</button>
      </div>
      {draft?.type === "photo" ? <form className={styles.panel} onSubmit={submitPhoto} aria-label="Share a photo">
        <h2>Share a photo</h2>
        <label className={styles.field}>Name this memory<input maxLength={80} value={draft.title} placeholder="Saturday at four" disabled={busy} onChange={event => changeDraft({ ...draft, title: event.target.value })} /></label>
        <label className={styles.field}>Photo<input type="file" disabled={busy} accept={memoryPhotoTypes.join(",")} onChange={event => {
          const file = event.target.files?.[0] ?? null;
          if (file && (!memoryPhotoTypes.includes(file.type) || file.size > maxMemoryPhotoBytes)) {
            event.target.value = "";
            changeDraft({ ...draft, file: null });
            setError("Choose a JPEG, PNG, or WebP photo up to 5 MB.");
          } else changeDraft({ ...draft, file });
        }} /></label>
        <p className={styles.small}>JPEG, PNG, or WebP up to 5 MB. This photo is shared only in Together.</p>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Sharing…" : "Share photo"}</button>
          <button type="button" className={styles.link} disabled={busy} onClick={() => changeDraft(null)}>Cancel</button>
        </div>
      </form> : !photo ? <div className={styles.empty}>
        <h2>A little photo book for the two of you.</h2>
        <p>Add a photo you’d like to keep. It can stay just a photo, or either of you can pin something you remember.</p>
      </div> : <div className={styles.book}>
        <div className={styles.photoTitle}><p className={styles.eyebrow}>Shared photo</p><h2>{photo.title}</h2></div>
        <div className={styles.spread}>
          <MemoryPhotoCanvas key={photo.id} photo={photo} path={url} selected={targetPinId ?? pin?.id ?? null}
            placing={isPlacing} draftPoint={draftPoint} disabled={busy || !!draft} partnerName={partnerName}
            onSelect={selectPin} onPlace={(point, existing) => {
              if (!isPlacing) return;
              if (existing) {
                changeDraft(null);
                setPinId(existing);
                setNotice("There’s already a detail here. You can add your side.");
              } else changeDraft({
                type: "note", photoId: photo.id, target: { id: crypto.randomUUID(), point }, title: "", format: "voice", text: "", clip: null,
              });
            }} />
          {isPlacing ? <div className={styles.panel}>
            <p className={styles.eyebrow}>New detail</p><h3>Where’s the memory?</h3>
            <p id="memory-spot-instructions">Tap a spot on the photo, or use the arrow keys and press Enter.</p>
            <button type="button" className={styles.link} onClick={() => changeDraft(null)}>Cancel</button>
          </div> : note ? <form className={styles.panel} onSubmit={submitNote} aria-label="Your private note draft">
            <p className={styles.eyebrow}>Only you · Draft</p>
            <h3>{targetPinId ? note.title : "A new detail"}</h3>
            {!targetPinId ? <>
              <label className={styles.field}>Name this detail<input maxLength={48} value={note.title} disabled={busy} onChange={event => updateNote({ title: event.target.value })} placeholder="The foam heart" /></label>
              <div className={styles.actions} role="group" aria-label="Note format">
                <button type="button" className={styles.secondary} disabled={busy || recording} aria-pressed={note.format === "voice"} onClick={() => updateNote({ format: "voice" })}>Voice</button>
                <button type="button" className={styles.secondary} disabled={busy || recording} aria-pressed={note.format === "text"} onClick={() => updateNote({ format: "text" })}>Text</button>
              </div>
            </> : null}
            {note.format === "voice" ? <MemoryVoiceDraft clip={note.clip} onClip={clip => updateNote({ clip })} onActive={setRecording} disabled={busy} />
              : <label className={styles.field}>What do you remember?<textarea maxLength={220} rows={3} disabled={busy} value={note.text} onChange={event => updateNote({ text: event.target.value })} placeholder="The little thing the picture doesn’t tell…" /></label>}
            <p className={styles.small}>Nothing new is shared until you choose to share it.</p>
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={busy || recording}>{busy ? "Sharing…" : note.format === "voice" ? "Share voice note" : "Share note"}</button>
              <button type="button" className={styles.link} disabled={busy} onClick={() => changeDraft(null)}>Cancel</button>
            </div>
          </form> : pin ? <PinDetail pin={pin} photo={photo} photoUrl={url} partnerName={partnerName} busy={busy}
            onStart={format => beginNote(photo, pin, format)} onRemove={part => setRemoval({ photoId: photo.id, pinId: pin.id, part })} />
            : <div className={styles.panel}><h3>Just the photo</h3><p>Pin the little thing you remember. Your person can add their side anytime.</p></div>}
          <div className={styles.tools}>
            {photo.pins.length ? <div className={styles.actions} role="group" aria-label="Browse pinned details">
              {photo.pins.map((entry, index) => <button type="button" key={entry.id} className={styles.secondary}
                aria-pressed={(targetPinId ?? pin?.id) === entry.id} disabled={busy || !!draft} onClick={() => selectPin(entry.id)}>{index + 1} · {entry.title}</button>)}
            </div> : null}
            {!draft ? <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => {
                setNotice(""); changeDraft({ type: "place", photoId: photo.id });
              }}>+ Pin a detail</button>
              {photo.yours ? <button type="button" className={styles.link} disabled={busy} onClick={() => setRemoval({ photoId: photo.id })}>Remove photo</button> : null}
            </div> : null}
          </div>
        </div>
      </div>}
    </> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <ConfirmDialog open={removal !== null}
      title={removal && "pinId" in removal ? (removal.part === "voice" ? "Remove your voice note?" : "Remove your written note?") : "Remove this photo?"}
      description={removal && "pinId" in removal ? "The photo and any other notes will stay. If this was the only note at this spot, the pin will disappear."
        : "This removes the photo and all of its pinned details and recordings for both of you."}
      cancelLabel="Keep it" confirmLabel="Remove"
      onCancel={() => setRemoval(null)} onConfirm={() => {
        if (!removal) return;
        const target = memoryPhotoPath(base, removal.photoId);
        setRemoval(null);
        if ("pinId" in removal) void run(async () => {
          await changeMemory(`${memoryNotePath(target, removal.pinId)}/${removal.part}`, "DELETE", userId);
        }, "Your note was removed.");
        else void run(async () => {
          await changeMemory(target, "DELETE", userId);
          setPhotoId(null); setPinId(null);
        }, "Photo removed from Together.");
      }} />
  </section>;
}

function PinDetail({ pin, photo, photoUrl, partnerName, busy, onStart, onRemove }: {
  pin: MemoryPin; photo: MemoryPhoto; photoUrl: string; partnerName: string; busy: boolean;
  onStart: (mode: Format) => void; onRemove: (mode: Format) => void;
}) {
  const mine = pin.notes.find(entry => entry.yours);
  return <section className={styles.panel} aria-label={pin.title}>
    <p className={styles.eyebrow}>Detail {photo.pins.indexOf(pin) + 1}</p>
    <h3>{pin.title}</h3>
    {pin.notes.map(entry => <div key={entry.id} className={styles.note}>
      <p className={styles.byline}>{entry.yours ? "You" : partnerName}{entry.voiceDurationMs ? " · Voice note" : ""}</p>
      {entry.voiceDurationMs ? <MemoryVoicePlayer
        path={memoryVoicePath(photoUrl, pin.id, entry.id)} version={entry.updatedAt}
        label={entry.yours ? "your shared voice note" : `${partnerName}’s voice note`} /> : null}
      {entry.text ? <blockquote>{entry.text}</blockquote> : null}
    </div>)}
    <div className={styles.actions}>
      <button type="button" className={mine?.voiceDurationMs ? styles.link : styles.primary} disabled={busy} onClick={() => onStart("voice")}>
        {mine?.voiceDurationMs ? "Replace voice note" : "Record your side"}
      </button>
      <button type="button" className={mine?.text ? styles.link : styles.secondary} disabled={busy} onClick={() => onStart("text")}>
        {mine?.text ? "Edit text" : "Write your side"}
      </button>
      {mine?.voiceDurationMs ? <button type="button" className={styles.link} disabled={busy} onClick={() => onRemove("voice")}>Remove voice note</button> : null}
      {mine?.text ? <button type="button" className={styles.link} disabled={busy} onClick={() => onRemove("text")}>Remove text</button> : null}
    </div>
  </section>;
}
