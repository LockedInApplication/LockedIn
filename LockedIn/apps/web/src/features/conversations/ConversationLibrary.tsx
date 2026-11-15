"use client";
import { useState, useRef, useEffect } from "react";
import type { JourneyOverview } from "@/features/journey/journey.types";
import type { ConversationPack } from "./conversation.types";
import ConversationTopicPreview from "./ConversationTopicPreview";
import styles from "./conversation-library.module.scss";
export type ConversationLibraryProps = {
  packs: ConversationPack[];
  selection: JourneyOverview["conversationSelection"];
  currentPackKey: string | null;
  canStart: boolean;
  busy: boolean;
  onStart: (packKey: string | null) => void;
  onWithdraw: () => void;
  onContinue?: () => void;
};
export default function ConversationLibrary({
  packs,
  selection,
  canStart,
  busy,
  onStart,
  onWithdraw,
  onContinue,
}: ConversationLibraryProps) {
  const [preview, setPreview] = useState<ConversationPack | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousTopic = useRef<string | null>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (preview) {
      previousTopic.current = preview.key;
      heading.current?.focus();
    } else if (previousTopic.current)
      section.current
        ?.querySelector<HTMLButtonElement>(
          `[data-topic="${CSS.escape(previousTopic.current)}"]`,
        )
        ?.focus({ preventScroll: true });
  }, [preview]);
  const partner = selection?.partnerChoice,
    own = selection?.ownChoice;
  const name = (key: string | null) =>
    key === null
      ? "Either conversation"
      : (packs.find((p) => p.key === key)?.title ?? "Unavailable topic");
  if (preview)
    return (
      <ConversationTopicPreview
        pack={preview}
        canStart={canStart}
        busy={busy}
        headingRef={heading}
        onBack={() => setPreview(null)}
        onSuggest={() => onStart(preview.key)}
      />
    );
  return (
    <section
      ref={section}
      className={styles.library}
      aria-label="Conversation topics"
    >
      <h2>What’s on your mind?</h2>
      <p>Pick a topic to suggest to {partner?.name ?? "your partner"}.</p>
      {partner?.submitted ? (
        <aside className={styles.suggestion}>
          <span className={styles.kicker}>{partner.name} suggested</span>
          <h3>{name(partner.packKey)}</h3>
          {partner.packKey === null ? (
            <p>They’re happy for you to choose a topic.</p>
          ) : null}
          <button
            type="button"
            disabled={busy || !canStart}
            onClick={() => {
              const pack = packs.find((p) => p.key === partner.packKey);
              if (pack) setPreview(pack);
            }}
            hidden={partner.packKey === null}
          >
            Review suggestion →
          </button>
        </aside>
      ) : null}
      {own?.submitted ? (
        <div className={styles.own}>
          <span>
            Your choice: <strong>{name(own.packKey)}</strong>
          </span>
          <button type="button" disabled={busy} onClick={onWithdraw}>
            Withdraw
          </button>
        </div>
      ) : null}
      {!canStart ? (
        <div>
          <p role="status">
            Finish your current check-in together before choosing another
            conversation.
          </p>
          {onContinue ? (
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={onContinue}
            >
              Continue current conversation →
            </button>
          ) : null}
        </div>
      ) : null}
      <h3>Explore topics</h3>
      <div className={styles.topics}>
        {packs.map((pack) => (
          <button
            className={styles.topic}
            key={pack.key}
            data-topic={pack.key}
            type="button"
            disabled={busy}
            onClick={() => setPreview(pack)}
          >
            <span className={styles.icon} aria-hidden>
              {pack.icon}
            </span>
            <span>
              <strong>{pack.title}</strong>
              <small>{pack.questionCount} private prompts · View topic</small>
            </span>
            <span aria-hidden>›</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.secondary}
        disabled={busy || !canStart}
        onClick={() => onStart(null)}
      >
        Either works for me
      </button>
      <p className={styles.privacy}>
        Your answers begin privately. Sharing them is a separate choice.
      </p>
      <details>
        <summary>How choosing together works</summary>
        <p>
          Suggest a topic, accept your partner’s suggestion, or choose Either. A
          conversation begins only when your choices meet. You can withdraw your
          choice.
        </p>
      </details>
    </section>
  );
}
