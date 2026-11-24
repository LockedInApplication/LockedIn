"use client";
import { useState, useRef, useEffect } from "react";
import { conversationTopicAnchor } from "@/features/journey/journey.navigation";
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
  currentPackKey,
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
  const pickedKey = own?.submitted ? own.packKey : currentPackKey;
  const hasPickedTopic = packs.some(pack => pack.key === pickedKey);
  const focusHeading = !hasPickedTopic && !own?.submitted;
  function openTopic(pack: ConversationPack, source: "suggestion" | "list") {
    returnTo.current = source === "suggestion" ? "[data-review-suggestion]" : `[data-topic="${CSS.escape(pack.key)}"]`;
    setPreview(pack);
  }
  const name = (key: string | null) =>
    key === null
      ? "Either conversation"
      : (packs.find((p) => p.key === key)?.title ?? "Unavailable topic");

  function topicButton(pack: ConversationPack, source: "suggestion" | "list") {
    const isSuggestion = source === "suggestion";
    const picked = pack.key === pickedKey && (!isSuggestion || canStart);
    return <button key={pack.key} className={styles.topic} type="button"
      id={picked ? conversationTopicAnchor : undefined} data-picked={picked || undefined}
      data-topic={isSuggestion ? undefined : pack.key} data-review-suggestion={isSuggestion || undefined}
      disabled={busy || (isSuggestion && !canStart)} onClick={() => openTopic(pack, source)}>
      <span>
        {picked ? <span className={styles.pickLabel}>{own?.submitted ? "Your pick" : "Current conversation"}</span> : null}
        <strong>{pack.title}</strong>
        <small>{pack.description || `${pack.questionCount} private prompts`}</small>
      </span>
      <span aria-hidden="true">›</span>
    </button>;
  }

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
      <h2 id={focusHeading ? conversationTopicAnchor : undefined} tabIndex={focusHeading ? -1 : undefined}>Pick a topic</h2>
      <p>Suggest a topic to {partner?.name ?? "your partner"}. You’ll each answer privately once you agree.</p>
      {partner?.submitted ? (
        <aside className={styles.suggestion}>
          <span className={styles.kicker}>{partner.name} suggested</span>
          {suggested ? topicButton(suggested, "suggestion") : <>
            <h3>{name(partner.packKey)}</h3>
            {partner.packKey === null ? <p>They’re happy for you to choose a topic.</p> : null}
          </>}
        </aside>
      ) : null}
      {own?.submitted ? (
        <div className={styles.own} id={hasPickedTopic ? undefined : conversationTopicAnchor}
          tabIndex={hasPickedTopic ? undefined : -1} data-picked={own.packKey === null || undefined}>
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
        {topics.map(pack => topicButton(pack, "list"))}
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
