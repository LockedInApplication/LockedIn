"use client";

import { useId, useRef, useState } from "react";
import { togetherStarter } from "./chat-starter";
import styles from "./chat.module.scss";

export default function ChatPrompt({ hasDraft, disabled, onUse }: {
  hasDraft: boolean;
  disabled: boolean;
  onUse: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className={styles.promptTool} onKeyDown={event => {
    if (!open || event.key !== "Escape") return;
    event.stopPropagation();
    setOpen(false);
    trigger.current?.focus();
  }}>
    <button ref={trigger} className={styles.promptToggle} type="button" aria-controls={id} aria-expanded={open}
      disabled={disabled} onClick={() => setOpen(!open)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" />
      </svg>
      Try a prompt
    </button>
    <div className={styles.promptPanel} id={id} hidden={!open}>
      <p>{togetherStarter.text}</p>
      <button type="button" disabled={disabled || hasDraft} onClick={() => {
        if (disabled || hasDraft) return;
        onUse(togetherStarter.text);
        setOpen(false);
      }}>Use in draft</button>
      {hasDraft ? <p className={styles.muted}>Send or clear your current draft first.</p> : null}
    </div>
  </div>;
}
