"use client";

import styles from "@/app/journey/journey.module.scss";
import { useState, useMemo } from "react";

export default function ReflectionForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (outcome: string, note: string) => void;
}) {
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const options = useMemo(
    () => [
      ["COMPLETED", "We followed through"],
      ["CHANGED", "What we need has changed"],
      ["PAUSED", "We want to pause this"],
      ["NOT_RELEVANT", "This no longer feels relevant"],
    ],
    [],
  );

  return (
    <form
      className={styles.reflectionForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (outcome) onSubmit(outcome, note);
      }}
    >
      <span className={styles.eyebrow}>PRIVATE REFLECTION</span>
      <h3>What feels true now?</h3>
      <div className={styles.reflectionOptions}>
        {options.map(([value, label]) => (
          <label key={value} className={outcome === value ? styles.optionSelected : ""}>
            <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="A private note for yourself (optional)" />
      <button className={styles.primaryAction} disabled={!outcome || busy}>{busy ? "Saving..." : "Save my reflection"}</button>
    </form>
  );
}
