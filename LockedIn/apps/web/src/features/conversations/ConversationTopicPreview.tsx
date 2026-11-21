"use client";
import type { RefObject } from "react";
import type { ConversationPack } from "./conversation.types";
import styles from "./conversation-library.module.scss";
export default function ConversationTopicPreview({
  pack,
  busy,
  canStart,
  onBack,
  onSuggest,
  headingRef,
}: {
  pack: ConversationPack;
  busy: boolean;
  canStart: boolean;
  onBack: () => void;
  onSuggest: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section
      className={styles.library}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.preventDefault();
          onBack();
        }
      }}
    >
      <button
        type="button"
        className={styles.back}
        disabled={busy}
        onClick={onBack}
      >
        ← All topics
      </button>
      <div className={styles.topicPreview}>
        <h2 tabIndex={-1} ref={headingRef}>
          {pack.title}
        </h2>
        <p>{pack.description}</p>
        <span className={styles.kicker}>
          {pack.questionCount} private prompts
        </span>
        <button
          type="button"
          className={styles.primary}
          disabled={busy || !canStart}
          onClick={onSuggest}
        >
          {busy ? "Saving…" : "Suggest this conversation →"}
        </button>
      </div>
      {!canStart ? (
        <p>
          Finish your current check-in together before choosing another
          conversation.
        </p>
      ) : null}
      <p className={styles.privacy}>
        Your partner chooses too. Your answers stay private until you choose to
        share.
      </p>
    </section>
  );
}
