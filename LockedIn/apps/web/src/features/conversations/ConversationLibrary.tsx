"use client";

import styles from "@/app/journey/journey.module.scss";
import type { JourneyOverview } from "@/features/journey/journey.types";
import type { ConversationPack } from "./conversation.types";

export type ConversationLibraryProps = {
  packs: ConversationPack[];
  selection: JourneyOverview["conversationSelection"];
  currentPackKey: string | null;
  canStart: boolean;
  busy: boolean;
  onStart: (packKey: string | null) => void;
  onWithdraw: () => void;
};

export default function ConversationLibrary({
  packs,
  selection,
  currentPackKey,
  canStart,
  busy,
  onStart,
  onWithdraw,
}: ConversationLibraryProps) {
  const packName = (packKey: string | null) =>
    packKey === null
      ? "Either conversation"
      : packs.find((pack) => pack.key === packKey)?.title ?? "A conversation";

  return (
    <section className={styles.librarySection}>
      <div className={styles.libraryHeader}>
        <div>
          <span className={styles.eyebrow}>GUIDED CONVERSATIONS</span>
          <h2>Choose what matters now.</h2>
          <p>Each topic starts privately. Answers and written context are shared only with fresh consent.</p>
        </div>
        {!canStart ? <span className={styles.inProgressPill}>Finish your current check-in first</span> : null}
      </div>
      {canStart ? (
        <div className={styles.choiceBoard}>
          <div>
            <span className={styles.eyebrow}>CHOOSE TOGETHER</span>
            <h3>No conversation begins until both choices meet.</h3>
            <p>
              Suggest a topic, accept your partner&apos;s suggestion, choose another, or say
              that either works for you.
            </p>
          </div>
          <div className={styles.choiceStates}>
            <div>
              <span>You</span>
              <strong>{selection?.ownChoice.submitted ? packName(selection.ownChoice.packKey) : "No choice yet"}</strong>
              {selection?.ownChoice.submitted ? <button onClick={onWithdraw} disabled={busy}>Withdraw</button> : null}
            </div>
            <div>
              <span>{selection?.partnerChoice.name ?? "Your partner"}</span>
              <strong>{selection?.partnerChoice.submitted ? packName(selection.partnerChoice.packKey) : "Waiting for their choice"}</strong>
            </div>
          </div>
          <button
            className={selection?.ownChoice.submitted && selection.ownChoice.packKey === null ? styles.eitherSelected : ""}
            disabled={busy}
            onClick={() => onStart(null)}
          >
            Either works for me
          </button>
        </div>
      ) : null}
      <div className={styles.packGrid}>
        {packs.map((pack) => (
          <article className={`${styles.packCard} ${styles[`pack_${pack.accent}`] ?? ""}`} key={pack.key}>
            <div className={styles.packIcon}>{pack.icon}</div>
            <div className={styles.packChoiceBadges}>
              {selection?.ownChoice.submitted && selection.ownChoice.packKey === pack.key ? <span>Your suggestion</span> : null}
              {selection?.partnerChoice.submitted && selection.partnerChoice.packKey === pack.key ? <span>{selection.partnerChoice.name}&apos;s suggestion</span> : null}
            </div>
            <span>{pack.questionCount} private prompts</span>
            <h3>{pack.title}</h3>
            <p>{pack.description}</p>
            <button
              disabled={busy || !canStart}
              onClick={() => onStart(pack.key)}
            >
              {currentPackKey === pack.key && !canStart
                ? "Current conversation"
                : selection?.partnerChoice.submitted &&
                    selection.partnerChoice.packKey === pack.key &&
                    selection.ownChoice.packKey !== pack.key
                  ? "Accept this suggestion"
                  : selection?.ownChoice.submitted && selection.ownChoice.packKey === pack.key
                    ? "Your suggestion"
                : busy
                  ? "Preparing..."
                  : "Suggest this conversation"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
