"use client";

import { useState } from "react";
import styles from "../page.module.scss";

const previews = {
  coffee: {
    label: "Coffee and a long walk",
    answer: "A farmers’ market, then a long walk with a coffee.",
    opener: "I’m a long-walk person too. Where would we grab coffee first?",
  },
  kitchen: {
    label: "Something slow in the kitchen",
    answer: "Making pasta from scratch, with the music turned up.",
    opener: "What’s the song that always ends up on your cooking playlist?",
  },
  bookstore: {
    label: "Getting lost in a bookstore",
    answer: "A used bookstore with no plan and all afternoon to look.",
    opener: "What’s the last book you bought just because of the cover?",
  },
} as const;

type Choice = keyof typeof previews;

export default function FirstHelloPreview() {
  const [choice, setChoice] = useState<Choice>("coffee");
  const example = previews[choice];

  return (
    <section id="preview" className={`${styles.wrap} ${styles.preview} ${styles.reveal}`} aria-labelledby="preview-title">
      <div className={styles.previewCopy}>
        <p className={styles.kicker}>Try it · No account needed</p>
        <h2 id="preview-title">A Sunday you’d <em>happily repeat.</em></h2>
        <p>Pick the Sunday you’d want, and see what someone might say back.</p>
        <fieldset className={styles.choices}>
          <legend>What sounds like you?</legend>
          {Object.entries(previews).map(([key, value]) => (
            <label className={styles.choice} key={key}>
              <input type="radio" name="hello-preview" value={key} checked={choice === key} onChange={() => setChoice(key as Choice)} />
              <span>{value.label}</span>
            </label>
          ))}
        </fieldset>
        <p className={styles.previewNote}>Just a preview. Nothing is sent or saved.</p>
      </div>
      <div className={styles.sample} aria-label="Example conversation">
        <div className={styles.sampleHeader}>
          <span className={styles.sampleMark} aria-hidden="true">✳</span>
          <div><strong>A first hello</strong><span>LockedIn · Example</span></div>
          <span className={styles.demoBadge}>Demo</span>
        </div>
        <div aria-live="polite" aria-atomic="true"><div key={choice} className={styles.sampleBody}>
          <div className={styles.answer}>
            <span>Profile prompt</span>
            <strong>A Sunday I’d happily repeat…</strong>
            <p>{example.answer}</p>
          </div>
          <div className={styles.reply}>
            <span>One way to reply</span>
            <p>{example.opener}</p>
          </div>
        </div></div>
      </div>
    </section>
  );
}
