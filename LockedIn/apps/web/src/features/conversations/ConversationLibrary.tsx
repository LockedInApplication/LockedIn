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
  const returnTo = useRef<string | null>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (preview) {
      heading.current?.focus();
    } else if (returnTo.current)
      section.current
        ?.querySelector<HTMLButtonElement>(returnTo.current)
        ?.focus({ preventScroll: true });
  }, [preview]);
  const partner = selection?.partnerChoice,
    own = selection?.ownChoice;
  const suggested = packs.find(pack => pack.key === partner?.packKey);
  const topics = partner?.submitted && canStart && suggested ? packs.filter(pack => pack.key !== suggested.key) : packs;
  function openTopic(pack: ConversationPack, source: "suggestion" | "list") {
    returnTo.current = source === "suggestion" ? "[data-review-suggestion]" : `[data-topic="${CSS.escape(pack.key)}"]`;
    setPreview(pack);
  }
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
      <h2>Pick a topic</h2>
      <p>Suggest a topic to {partner?.name ?? "your partner"}. You’ll each answer privately once you agree.</p>
      {partner?.submitted ? (
        <aside className={styles.suggestion}>
          <span className={styles.kicker}>{partner.name} suggested</span>
          {suggested ? <button className={styles.topic} type="button" data-review-suggestion
            disabled={busy || !canStart} onClick={() => openTopic(suggested, "suggestion")}>
            <span><strong>{suggested.title}</strong><small>{suggested.description}</small></span>
            <span aria-hidden="true">›</span>
          </button> : <>
            <h3>{name(partner.packKey)}</h3>
            {partner.packKey === null ? <p>They’re happy for you to choose a topic.</p> : null}
          </>}
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
      {topics.length ? <><h3>Explore topics</h3>
      <div className={styles.topics}>
        {topics.map((pack) => (
          <button
            className={styles.topic}
            key={pack.key}
            data-topic={pack.key}
            type="button"
            disabled={busy}
            onClick={() => openTopic(pack, "list")}
          >
            <span>
              <strong>{pack.title}</strong>
              <small>{pack.description || `${pack.questionCount} private prompts`}</small>
            </span>
            <span aria-hidden>›</span>
          </button>
        ))}
      </div></> : null}
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
