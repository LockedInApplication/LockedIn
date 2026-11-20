"use client";

import { useEffect, useId, useRef, useState } from "react";
import { claimTinyLanternWelcome, tinyLanternTip, tinyLanternWelcome, type TinyLanternView } from "../tiny-lantern";
import styles from "../tiny-lantern.module.scss";

type Props = {
  userId: string;
  relationshipId: string;
  isMutuallyLockedIn: boolean;
  view: TinyLanternView;
};

export default function TinyLantern({ userId, relationshipId, isMutuallyLockedIn, view }: Props) {
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<"welcome" | "tip" | null>(null);
  const welcoming = mode === "welcome" && isMutuallyLockedIn && view === "home";
  const open = welcoming || mode === "tip";

  useEffect(() => {
    if (!isMutuallyLockedIn || view !== "home") return;
    let canceled = false;
    // Do not consume the greeting from a discarded mount (including Strict Mode replay).
    queueMicrotask(() => {
      if (!canceled && claimTinyLanternWelcome(() => window.localStorage, userId, relationshipId)) {
        setMode(current => current ?? "welcome");
      }
    });
    return () => { canceled = true; };
  }, [isMutuallyLockedIn, relationshipId, userId, view]);

  return (
    <aside className={styles.guide} aria-label="Tiny Lantern help" data-welcoming={welcoming}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setMode(open ? null : "tip")}
      >
        <svg className={styles.lantern} data-lantern-ornament aria-hidden="true" viewBox="0 0 40 40">
          <circle cx="20" cy="21" r="17" fill="#f4e5ff" />
          <path d="M18 10V8a2 2 0 0 1 4 0v2" fill="none" stroke="#63426d" strokeWidth="1.6" />
          <rect x="12" y="12" width="16" height="19" rx="6" fill="#ffdd88" stroke="#63426d" strokeWidth="1.5" />
          <path d="M13 13h14M14 30h12" stroke="#63426d" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M16.5 21v1m7-1v1m-5 3q1.5 1.5 3 0" fill="none" stroke="#543252" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M31 8v6m-3-3h6M8 23v4m-2-2h4" stroke="#9b5b92" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Need a hand?
      </button>
      <div id={panelId} aria-live="polite">
        {open ? (
          <div className={styles.panel}>
            <p>{welcoming ? tinyLanternWelcome : tinyLanternTip(view)}</p>
            <button type="button" className={styles.dismiss} aria-label="Got it, dismiss Tiny Lantern" onClick={() => {
              trigger.current?.focus({ preventScroll: true });
              setMode(null);
            }}>Got it</button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
