"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { starterQuestion, type RoomShelf } from "./room-to-talk-api";
import styles from "./room-to-talk.module.scss";

export type RoomEdit =
  | { kind: "topic"; shelf: string }
  | { kind: "shelf" }
  | { kind: "file"; shelf: string }
  | { kind: "discuss"; takeaway: string | null };

export type RoomSubmission =
  | { kind: "topic"; id: string; question: string; shelf: string }
  | { kind: "shelf"; id: string; name: string }
  | { kind: "file"; shelf: string }
  | { kind: "discuss"; takeaway: string | null };

const copy = {
  topic: { title: "Add a topic", submit: "Save topic" },
  shelf: { title: "New shelf", submit: "Create shelf" },
  file: { title: "Move to shelf", submit: "Move topic" },
  discuss: { title: "Mark discussed", submit: "Mark discussed" },
} as const;

export default function RoomTalkEditor({ edit, shelves, busy, onCancel, onChange, onSave }: {
  edit: RoomEdit; shelves: RoomShelf[]; busy: boolean;
  onCancel: () => void; onChange: (dirty: boolean) => void; onSave: (data: RoomSubmission) => void;
}) {
  const [shelf, setShelf] = useState("shelf" in edit ? edit.shelf : "unsorted");
  const [text, setText] = useState(edit.kind === "discuss" ? edit.takeaway ?? "" : "");
  const shelfFieldId = useId();
  const textFieldId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const question = useRef<HTMLTextAreaElement>(null);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const labels = copy[edit.kind];
  const emptyRequired = (edit.kind === "topic" || edit.kind === "shelf") && !text.trim();
  const inputChanged = text.trim() !== (edit.kind === "discuss" ? edit.takeaway ?? "" : "");
  const shelfChanged = "shelf" in edit && shelf !== edit.shelf;
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { onChange(inputChanged || shelfChanged); }, [inputChanged, onChange, shelfChanged]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || emptyRequired) return;
    const trimmed = text.trim();
    if (edit.kind === "discuss") { onSave({ kind: "discuss", takeaway: trimmed || null }); return; }
    if (edit.kind === "file") { onSave({ kind: "file", shelf }); return; }
    const signature = JSON.stringify([shelf, trimmed]);
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    const id = attempt.current.id;
    onSave(edit.kind === "topic" ? { kind: "topic", id, question: trimmed, shelf } : { kind: "shelf", id, name: trimmed });
  }

  return <form className={styles.editor} aria-label={labels.title} onSubmit={submit}>
    <h2 tabIndex={-1} ref={heading}>{labels.title}</h2>
    <fieldset disabled={busy}>
      {edit.kind === "shelf" ? <div className={styles.field}>
        <label htmlFor={textFieldId}>Shelf name</label>
        <input id={textFieldId} required maxLength={48} value={text} onChange={event => setText(event.target.value)} placeholder="e.g. Family and traditions" />
      </div> : null}
      {edit.kind === "topic" || edit.kind === "file" ? <div className={styles.field}>
        <label htmlFor={shelfFieldId}>Shelf</label>
        <select id={shelfFieldId} value={shelf} onChange={event => setShelf(event.target.value)}>
          {shelves.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div> : null}
      {edit.kind === "topic" ? <>
        <div className={styles.field}>
          <label htmlFor={textFieldId}>Opening question or topic</label>
          <textarea id={textFieldId} ref={question} required rows={3} maxLength={200} value={text} onChange={event => setText(event.target.value)} />
        </div>
        <button type="button" className={styles.textButton} disabled={Boolean(text.trim())} onClick={() => { setText(starterQuestion(shelf)); question.current?.focus(); }}>Use a starter</button>
        <p className={styles.hint}>You’ll both see it on the shelf. Saving doesn’t send a notification.</p>
      </> : null}
      {edit.kind === "discuss" ? <div className={styles.field}>
        <label htmlFor={textFieldId}>Our takeaway <span>(optional)</span></label>
        <textarea id={textFieldId} rows={3} maxLength={280} value={text} onChange={event => setText(event.target.value)} placeholder="What would you like to remember?" />
      </div> : null}
      {edit.kind === "discuss" ? <p className={styles.hint}>The topic and its replies stay on this shelf. Either of you can reopen it.</p> : null}
      <div className={styles.actions}>
        <button className={styles.primary} type="submit" disabled={emptyRequired || (edit.kind === "file" && !shelfChanged)}>{labels.submit}</button>
        <button className={styles.secondary} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}
