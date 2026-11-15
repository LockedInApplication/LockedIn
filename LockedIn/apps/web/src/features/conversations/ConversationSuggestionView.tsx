"use client";
import { useEffect, useRef, useState } from "react";
import { journeyRequest } from "../journey/journey.client";
import type { ConversationPack } from "./conversation.types";
import styles from "./conversation-library.module.scss";
type Suggestion =
  | {
      status: "pending";
      relationshipId: string;
      partnerName: string;
      pack: ConversationPack | null;
      canStart: boolean;
    }
  | { status: "unavailable"; reason: "changed" | "resolved" | "ended" };
type ContentProps = {
  data: Suggestion;
  busy: boolean;
  onAccept: () => void;
  onBrowse: () => void;
  onContinue?: () => void;
};
export function SuggestionContent({
  data,
  busy,
  onAccept,
  onBrowse,
  onContinue,
}: ContentProps) {
  if (data.status === "unavailable")
    return (
      <>
        <h2>This suggestion has moved on.</h2>
        <p>
          {data.reason === "ended"
            ? "This shared space has ended."
            : "It may have been withdrawn, changed, or already accepted."}
        </p>
        <button
          className={styles.secondary}
          type="button"
          disabled={busy}
          onClick={onBrowse}
        >
          See current conversations
        </button>
      </>
    );
  return (
    <>
      <span className={styles.kicker}>{data.partnerName} suggested</span>
      <div className={styles.suggestion}>
        <span className={styles.icon} aria-hidden>
          {data.pack?.icon ?? "✦"}
        </span>
        <h2>{data.pack?.title ?? "You choose the topic"}</h2>
        <p>
          {data.pack?.description ??
            "Your partner is happy for you to choose a conversation."}
        </p>
        {data.canStart && data.pack ? (
          <button
            className={styles.primary}
            type="button"
            disabled={busy}
            onClick={onAccept}
          >
            {busy ? "Saving…" : "Accept this conversation →"}
          </button>
        ) : null}
        {!data.canStart ? (
          <div>
            <p>
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
        <button
          className={styles.secondary}
          type="button"
          disabled={busy}
          onClick={onBrowse}
        >
          {data.pack ? "Suggest another topic" : "Choose a topic"}
        </button>
      </div>
      <p className={styles.privacy}>
        Opening this page does not accept it. Your answers begin privately.
        Sharing is a separate choice.
      </p>
    </>
  );
}
export default function ConversationSuggestionView({
  notificationId,
  revision,
  busy,
  onAccept,
  onBrowse,
  onHome,
}: {
  notificationId: string;
  revision: string;
  busy: boolean;
  onAccept: () => Promise<void>;
  onBrowse: () => void;
  onHome: () => void;
}) {
  const [state, setState] = useState<{
    data?: Suggestion;
    error?: string;
    version?: string;
  }>({});
  const [retry, setRetry] = useState(0);
  const title = useRef<HTMLDivElement>(null);
  const version = `${notificationId}:${revision}:${retry}`;
  const current = state.version === version;
  useEffect(() => {
    const controller = new AbortController();
    void journeyRequest<Suggestion>(
      `/api/journey/notifications/${encodeURIComponent(notificationId)}/conversation-suggestion`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, version });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            error:
              "This suggestion could not be loaded. It may no longer be available.",
            version,
          });
      });
    return () => controller.abort();
  }, [notificationId, revision, retry, version]);
  useEffect(() => {
    title.current?.focus();
    title.current?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <section className={`${styles.library} ${styles.focused}`}>
      <button
        type="button"
        className={styles.back}
        disabled={busy}
        onClick={onHome}
      >
        ← Back to our space
      </button>
      <div ref={title} tabIndex={-1} aria-live="polite">
        {current && state.data ? (
          <SuggestionContent
            data={state.data}
            busy={busy}
            onBrowse={onBrowse}
            onContinue={onHome}
            onAccept={() => {
              void onAccept().finally(() => setRetry((v) => v + 1));
            }}
          />
        ) : current && state.error ? (
          <>
            <h2>Suggestion unavailable</h2>
            <p role="alert">{state.error}</p>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => {
                setState({});
                setRetry((v) => v + 1);
              }}
            >
              Try again
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={onBrowse}
            >
              Browse conversations
            </button>
          </>
        ) : (
          <p role="status">Loading the suggestion…</p>
        )}
      </div>
    </section>
  );
}
