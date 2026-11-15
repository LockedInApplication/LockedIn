"use client";

import { useState } from "react";
import styles from "@/app/journey/journey.module.scss";
import { journeyRequest } from "@/features/journey/journey.client";
import type { AtlasChapter, AtlasWord } from "./atlas.types";

export type AtlasPrivateFormProps = {
  word: AtlasWord;
  chapter: AtlasChapter;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
};

export default function AtlasPrivateForm({
  word,
  chapter,
  busy,
  runAction,
}: AtlasPrivateFormProps) {
  const [definition, setDefinition] = useState("");
  const [example, setExample] = useState("");
  const [notMeaning, setNotMeaning] = useState("");
  const complete = [definition, example, notMeaning].every((value) => value.trim().length >= 8);

  return (
    <form
      className={styles.atlasPrivateForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (!complete) return;
        runAction(
          () => journeyRequest(`/api/journey/atlas/${chapter.id}/response`, {
            method: "PUT",
            body: JSON.stringify({ definition, example, notMeaning }),
          }),
          "Your meaning is saved privately.",
        );
      }}
    >
      <div className={styles.atlasFormHeader}>
        <span className={`${styles.atlasStageIcon} ${styles[`atlasColor_${word.color}`]}`}>{word.icon}</span>
        <div>
          <span className={styles.atlasStageLabel}>PRIVATE TRAIL · ONLY YOU CAN SEE THIS</span>
          <h3>What does “{word.title}” mean in your world?</h3>
          <p>Write naturally. This is a map of lived meaning, not a test or compatibility score.</p>
        </div>
      </div>
      <div className={styles.atlasPromptGrid}>
        <label>
          <span><b>1</b> In my words</span>
          <textarea value={definition} onChange={(event) => setDefinition(event.target.value)} maxLength={500} placeholder={`${word.title} means…`} />
        </label>
        <label>
          <span><b>2</b> A moment that shows it</span>
          <small>{word.mysteryPrompt}</small>
          <textarea value={example} onChange={(event) => setExample(event.target.value)} maxLength={500} placeholder="One real moment was…" />
        </label>
        <label>
          <span><b>3</b> What it is not</span>
          <textarea value={notMeaning} onChange={(event) => setNotMeaning(event.target.value)} maxLength={500} placeholder={`${word.title} does not mean…`} />
        </label>
      </div>
      <button className={styles.atlasPrimary} disabled={busy || !complete}>
        {busy ? "Saving privately..." : "Lock in my meaning"}
      </button>
      <small className={styles.atlasPrivacyNote}>🔒 Your answers stay closed until both private keys are ready.</small>
    </form>
  );
}
