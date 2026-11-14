"use client";

import { useState } from "react";
import styles from "@/app/journey/journey.module.scss";
import type { JourneySession } from "@/features/journey/journey.types";

export type IntentionFormProps = {
  session: JourneySession;
  busy: boolean;
  onSubmit: (
    answers: Record<string, string>,
    shareKeys: string[],
    contextNotes: Record<string, string>,
    contextShareKeys: string[],
  ) => void;
};

export default function IntentionForm({
  session,
  busy,
  onSubmit,
}: IntentionFormProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [shareKeys, setShareKeys] = useState<string[]>([]);
  const [contextNotes, setContextNotes] = useState<Record<string, string>>({});
  const [contextShareKeys, setContextShareKeys] = useState<string[]>([]);
  const complete = session.questions.every((question) => Boolean(answers[question.key]));

  return (
    <section className={styles.formCard}>
      <span className={styles.eyebrow}>MY INTENTIONS · PRIVATE</span>
      <h2>{session.topic}</h2>
      <p className={styles.formIntro}>
        Answer for yourself. Sharing is off by default and can be enabled separately for each response.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (complete) onSubmit(answers, shareKeys, contextNotes, contextShareKeys);
        }}
      >
        <div className={styles.questionList}>
          {session.questions.map((question, index) => (
            <fieldset className={styles.question} key={question.key}>
              <legend><span>{String(index + 1).padStart(2, "0")}</span>{question.label}</legend>
              <p>{question.helper}</p>
              <div className={styles.optionGrid}>
                {question.options.map((option) => (
                  <label key={option.value} className={answers[question.key] === option.value ? styles.optionSelected : ""}>
                    <input
                      type="radio"
                      name={question.key}
                      value={option.value}
                      checked={answers[question.key] === option.value}
                      onChange={() => setAnswers((current) => ({ ...current, [question.key]: option.value }))}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <label className={styles.shareControl}>
                <input
                  type="checkbox"
                  checked={shareKeys.includes(question.key)}
                  onChange={(event) =>
                    {
                      setShareKeys((current) =>
                        event.target.checked
                          ? [...current, question.key]
                          : current.filter((key) => key !== question.key),
                      );
                      if (!event.target.checked) {
                        setContextShareKeys((current) =>
                          current.filter((key) => key !== question.key),
                        );
                      }
                    }
                  }
                />
                <span>Allow this answer to be compared after both of us consent</span>
              </label>
              <div className={styles.contextComposer}>
                <label htmlFor={`context-${question.key}`}>What I hope you understand <span>optional</span></label>
                <textarea
                  id={`context-${question.key}`}
                  value={contextNotes[question.key] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setContextNotes((current) => ({ ...current, [question.key]: value }));
                    if (!value.trim()) {
                      setContextShareKeys((current) => current.filter((key) => key !== question.key));
                    }
                  }}
                  placeholder="Add context for yourself first. It stays private unless you explicitly share it."
                  maxLength={600}
                />
                <label className={styles.shareControl}>
                  <input
                    type="checkbox"
                    checked={contextShareKeys.includes(question.key)}
                    disabled={!shareKeys.includes(question.key) || !contextNotes[question.key]?.trim()}
                    onChange={(event) =>
                      setContextShareKeys((current) =>
                        event.target.checked
                          ? [...current, question.key]
                          : current.filter((key) => key !== question.key),
                      )
                    }
                  />
                  <span>Also reveal this written context with my answer</span>
                </label>
              </div>
            </fieldset>
          ))}
        </div>
        <div className={styles.formFooter}>
          <span>{shareKeys.length} of {session.questions.length} answers selected to share</span>
          <button className={styles.primaryAction} disabled={!complete || busy}>
            {busy ? "Saving privately..." : "Save my intentions"}
          </button>
        </div>
      </form>
    </section>
  );
}
