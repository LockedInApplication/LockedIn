"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { BrandRings } from "@/components/brandLogo";
import { latestPartnerMemoryNote, memoryNoteHref } from "@/features/memories/memory-note-preview";
import type { Memories } from "@/features/memories/memory-api";
import { maxTogetherNoteLength, type TogetherHomeNotes } from "@/features/together-notes/use-together-home-notes";
import { noteAge } from "../together-home";
import styles from "./together-home.module.scss";

export type LetterControls = {
  notes: TogetherHomeNotes;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onDirty: (value: boolean) => void;
};

export default function TogetherLetter({ partnerName, gallery, now, notes, busy, onBusy, onDirty, onNavigate }: LetterControls & {
  partnerName: string;
  gallery: Memories | null;
  now: number;
  onNavigate: (href: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  const open = draft !== null;
  useEffect(() => {
    if (open) input.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const yours = notes.data?.yours;
  const partner = notes.data?.partner;
  const memory = notes.data && !partner && !yours && gallery ? latestPartnerMemoryNote(gallery) : null;
  const note = partner ?? yours ?? memory;
  const memoryHref = memory ? memoryNoteHref(memory.target) : null;
  const shownOwn = !partner && !!yours;
  const label = shownOwn ? `Your note to ${partnerName}` : note ? `A note from ${partnerName}` : "Notes in Together";
  const age = note?.updatedAt ? noteAge(note.updatedAt, now) : null;
  const action = partner ? "Write one back" : yours ? "Edit your note" : memory ? "Write a note" : "Write the first note";

  function closeComposer() {
    returnFocus.current = true;
    setDraft(null);
    setError("");
    onDirty(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft?.trim();
    if (!text || text.length > maxTogetherNoteLength || !notes.data || busy || pending.current) return;
    pending.current = true;
    onBusy(true);
    setError("");
    try {
      await notes.share(text);
      closeComposer();
      setNotice(`Note shared with ${partnerName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t share your note. Try again.");
    } finally {
      pending.current = false;
      onBusy(false);
    }
  }

  return <section className={styles.letterCard} data-empty={!note || undefined} aria-label={label}>
    {note ? <>
      <span className={styles.letterSeal} aria-hidden="true"><BrandRings monochrome /></span>
      <p className={styles.letterLabel}>{label}{age ? <> · <time dateTime={note.updatedAt ?? undefined}>{age}</time></> : null}</p>
      <blockquote className={styles.letterQuote} data-full={!memory || undefined}>“{note.text}”</blockquote>
    </> : notes.data ? <>
      <h2>No notes yet.</h2>
      <p>Leave {partnerName} something to find the next time they open the app.</p>
    </> : <p role="status">{notes.error || "Opening your notes…"}</p>}
    {notice ? <p className={styles.noteSuccess} role="status">{notice}</p> : null}
    {open ? <form className={styles.letterComposer} onSubmit={submit} aria-labelledby={`${id}-label`}>
      <label id={`${id}-label`} htmlFor={`${id}-text`}>Note to {partnerName}</label>
      <textarea id={`${id}-text`} ref={input} aria-describedby={`${id}-hint`} rows={3} maxLength={maxTogetherNoteLength} value={draft}
        placeholder="Something you want them to find…" disabled={busy} onChange={event => {
          setDraft(event.target.value);
          onDirty(event.target.value !== (shownOwn ? yours?.text : undefined) && Boolean(event.target.value.trim()));
        }} />
      <div className={styles.letterHelp}>
        <p id={`${id}-hint`}>{yours ? "Sharing replaces your previous note on Together." : `Only you and ${partnerName} can see it after you share.`}</p>
        <span>{draft.length}/{maxTogetherNoteLength}</span>
      </div>
      {error ? <p className={styles.noteError} role="alert">{error}</p> : null}
      <div className={styles.letterActions}>
        <button type="submit" className={styles.shareLetter} disabled={busy || !draft.trim() || !notes.data}>{busy ? "Sharing…" : "Share note"}</button>
        <button type="button" className={styles.letterLink} disabled={busy} onClick={closeComposer}>Cancel</button>
      </div>
    </form> : notes.data ? <div className={styles.letterActions}>
      <button ref={trigger} type="button" className={styles.letterLink} disabled={busy} onClick={() => {
        setNotice("");
        setDraft(shownOwn && yours ? yours.text : "");
      }}>{action}<span aria-hidden="true">›</span></button>
      {memoryHref ? <Link className={styles.letterLink} href={memoryHref}
        onNavigate={event => { event.preventDefault(); onNavigate(memoryHref); }}>Open in Memories</Link> : null}
    </div> : notes.error ? <button type="button" className={styles.letterLink} onClick={notes.retry}>Try again</button> : null}
  </section>;
}
