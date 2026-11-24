"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { JourneyApiError, journeyRequest } from "@/features/journey/journey.client";
import { useQuietRefresh } from "@/features/notifications/use-quiet-refresh";
import { writeRoom, type RoomMessage, type RoomPage, type RoomQuote } from "./room-to-talk-api";
import { useRoomRefresh, useTopicPresence } from "./use-room-sync";
import styles from "./room-to-talk.module.scss";

const excerpt = (body: string) => body.length > 115 ? `${body.slice(0, 114).trimEnd()}…` : body;
const merge = (first: RoomMessage[], last: RoomMessage[]) => [...new Map([...first, ...last].map(item => [item.id, item])).values()]
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

export default function RoomTopicThread({ path, userId, partnerName, writable, busy, revision, run, onDirty, onExpired }: {
  path: string; userId: string; partnerName: string; writable: boolean; busy: boolean; revision: number;
  run: <T>(work: () => Promise<T>, after?: (value: T) => void) => Promise<void>;
  onDirty: (dirty: boolean) => void; onExpired: () => void;
}) {
  const [page, setPage] = useState<RoomPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<RoomMessage["kind"]>("REPLY");
  const [answer, setAnswer] = useState<RoomQuote | null>(null);
  const composerId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const stickToEnd = useRef(true);
  const earlier = useRef<AbortController | null>(null);
  const earlierOffset = useRef<number | null>(null);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const messagesPath = `${path}/messages`;
  const load = useCallback((signal: AbortSignal) => journeyRequest<RoomPage>(messagesPath, { cache: "no-store", signal }), [messagesPath]);
  const apply = useCallback((next: RoomPage) => {
    setPage(previous => {
      if (!previous || !next.before || !next.messages.some(message => previous.messages.some(item => item.id === message.id))) return next;
      return { messages: merge(previous.messages, next.messages), before: previous.messages[0]?.id === next.messages[0]?.id ? next.before : previous.before };
    });
    setUnavailable(false);
    setError(null);
  }, []);
  const fail = useCallback((cause: unknown) => {
    if (cause instanceof JourneyApiError && cause.status === 401) { onExpired(); return; }
    if (cause instanceof JourneyApiError && [403, 404].includes(cause.status)) {
      earlier.current?.abort();
      setLoadingEarlier(false);
      setPage(null);
      setUnavailable(true);
      setError("This conversation is no longer available.");
    } else setError("Replies couldn’t update. Please try again.");
  }, [onExpired]);
  const { invalidate } = useQuietRefresh(load, apply, fail);
  useRoomRefresh(invalidate, revision);
  useTopicPresence(path, userId, writable && !unavailable);
  useEffect(() => { onDirty(Boolean(body.trim())); }, [body, onDirty]);
  useEffect(() => () => { earlier.current?.abort(); onDirty(false); }, [onDirty]);

  useLayoutEffect(() => {
    const box = scroll.current;
    if (!box) return;
    if (earlierOffset.current !== null) {
      box.scrollTop = box.scrollHeight - earlierOffset.current;
      earlierOffset.current = null;
    } else if (stickToEnd.current) box.scrollTop = box.scrollHeight;
  }, [page]);

  async function showEarlier() {
    if (!page?.before || earlier.current) return;
    const controller = new AbortController();
    earlier.current = controller;
    setLoadingEarlier(true);
    try {
      const old = await journeyRequest<RoomPage>(`${messagesPath}?before=${encodeURIComponent(page.before)}`, { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (scroll.current) earlierOffset.current = scroll.current.scrollHeight - scroll.current.scrollTop;
      setPage(current => current && current.before === page.before ? { messages: merge(old.messages, current.messages), before: old.before } : current);
    } catch (cause) {
      if (!controller.signal.aborted) fail(cause);
    } finally {
      if (!controller.signal.aborted) setLoadingEarlier(false);
      if (earlier.current === controller) earlier.current = null;
    }
  }

  function chooseMode(next: RoomMessage["kind"], question: RoomQuote | null = null) {
    setKind(next); setAnswer(question); field.current?.focus();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text || !writable || busy || unavailable) return;
    const signature = JSON.stringify([kind, text, answer?.id]);
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    const data = { id: attempt.current.id, kind, body: text, replyToId: answer?.id ?? null };
    void run(() => writeRoom<RoomMessage>(messagesPath, userId, "POST", data), sent => {
      attempt.current = null;
      stickToEnd.current = true;
      setPage(current => current && { ...current, messages: merge(current.messages, [sent]) });
      setBody(""); setKind("REPLY"); setAnswer(null); onDirty(false);
      invalidate();
      field.current?.focus();
    });
  }

  return <section className={styles.thread} aria-label="Topic conversation">
    <h2>{writable ? "Conversation" : "Conversation history"}</h2>
    {error ? <p className={styles.notice} role="alert">{error} <button className={styles.textButton} type="button" onClick={invalidate}>Try again</button></p> : null}
    {page?.before ? <button className={styles.textButton} type="button" disabled={loadingEarlier} onClick={showEarlier}>
      {loadingEarlier ? "Loading earlier replies…" : "Show earlier replies"}
    </button> : null}
    {page?.messages.length ? (
      <div className={styles.scroll} ref={scroll} tabIndex={0} role="log" aria-label="Conversation messages"
        onScroll={event => {
          const box = event.currentTarget;
          stickToEnd.current = box.scrollHeight - box.clientHeight - box.scrollTop < 56;
        }}>
        <ol className={styles.messages}>
          {page.messages.map(message => <li className={styles.message} data-yours={message.yours || undefined} key={message.id}>
            <div className={styles.meta}><strong>{message.yours ? "You" : partnerName}</strong>
              {message.kind === "QUESTION" ? <span className={styles.pill}>Follow-up</span> : null}</div>
            <div className={styles.bubble}>
              {message.replyTo ? <blockquote className={styles.quote}>{message.replyTo.yours ? "You" : partnerName}: {excerpt(message.replyTo.body)}</blockquote> : null}
              <p>{message.body}</p>
            </div>
            {writable && !message.yours && message.kind === "QUESTION"
              ? <button type="button" className={styles.textButton} disabled={busy} onClick={() => chooseMode("REPLY", message)}>Answer</button> : null}
          </li>)}
        </ol>
      </div>
    ) : !error ? <p className={styles.hint}>{page ? "No replies yet." : "Opening the conversation…"}</p> : null}
    {writable && !unavailable ? <form className={styles.composer} onSubmit={submit} aria-label="Write in this conversation">
      <div className={styles.modes} role="group" aria-label="Choose reply or follow-up">
        <button type="button" disabled={busy} aria-pressed={kind === "REPLY"} onClick={() => chooseMode("REPLY")}>Reply</button>
        <button type="button" disabled={busy} aria-pressed={kind === "QUESTION"} onClick={() => chooseMode("QUESTION")}>Ask a follow-up</button>
      </div>
      {answer ? <div className={styles.replying}>
        <p className={styles.quote}>Replying to {partnerName}: {excerpt(answer.body)}</p>
        <button className={styles.textButton} type="button" disabled={busy} onClick={() => chooseMode("REPLY")}>Clear reply</button>
      </div> : null}
      <div className={styles.field}>
        <label htmlFor={composerId}>{kind === "QUESTION" ? "Follow-up question" : "Your reply"}</label>
        <textarea id={composerId} ref={field} rows={2} maxLength={420} value={body} readOnly={busy} onChange={event => setBody(event.target.value)}
          placeholder={kind === "QUESTION" ? "What would you like to ask?" : "Share what you think…"} />
      </div>
      <div className={styles.actions}>
        <button className={styles.primary} type="submit" disabled={busy || !body.trim()}>{kind === "QUESTION" ? "Send question" : "Send reply"}</button>
      </div>
    </form> : body.trim() ? <div className={styles.composer}>
      <p className={styles.hint}>This conversation isn’t open for replies. You can still copy your unsent draft.</p>
      <div className={styles.field}><label htmlFor={composerId}>Unsent draft</label><textarea id={composerId} rows={2} value={body} readOnly /></div>
      <button className={styles.textButton} type="button" onClick={() => setBody("")}>Discard draft</button>
    </div> : null}
  </section>;
}
