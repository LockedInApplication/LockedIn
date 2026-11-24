"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { JourneyApiError, journeyRequest } from "@/features/journey/journey.client";
import { roomToTalkHref } from "@/features/journey/journey.navigation";
import { useQuietRefresh } from "@/features/notifications/use-quiet-refresh";
import RoomTalkEditor, { type RoomEdit, type RoomSubmission } from "./RoomTalkEditor";
import RoomTopicThread from "./RoomTopicThread";
import { roomPath, shelfPath, topicPath, writeRoom, roomPhases, unsortedShelf, type RoomLibrary, type RoomShelf, type RoomTopic } from "./room-to-talk-api";
import { useRoomRefresh } from "./use-room-sync";
import styles from "./room-to-talk.module.scss";

type Props = {
  relationshipId: string; userId: string; partnerName: string; revision: number;
  shelfId: string | null; topicId: string | null;
  onNavigate: (href: string) => void; onDirty: (dirty: boolean) => void; onExpired: () => void;
};
type Run = <T>(work: () => Promise<T>, after?: (value: T) => void) => Promise<void>;
type TopicAction = { action: "suggest" | "withdraw" | "start" | "later" | "reopen" } | { action: "discuss"; takeaway: string | null };
type TopicSummary = Pick<RoomTopic, "phase" | "inPersonBy">;

export default function RoomToTalk(props: Props) {
  const { relationshipId, revision, onExpired, topicId, shelfId } = props;
  const base = roomPath(relationshipId);
  const [library, setLibrary] = useState<RoomLibrary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback((signal: AbortSignal) => journeyRequest<RoomLibrary>(base, { signal, cache: "no-store" }), [base]);
  const apply = useCallback((data: RoomLibrary) => { setLibrary(data); setLoadError(null); }, []);
  const fail = useCallback((error: unknown) => {
    if (error instanceof JourneyApiError && error.status === 401) { onExpired(); return; }
    if (error instanceof JourneyApiError && [403, 404].includes(error.status)) {
      setLibrary(null);
      setLoadError("This room is no longer available.");
    } else setLoadError("Room to Talk couldn’t update. Try again.");
  }, [onExpired]);
  const { invalidate, setBlocked } = useQuietRefresh(load, apply, fail);
  useRoomRefresh(invalidate, revision);
  function patchTopic(topic: RoomTopic) {
    setLibrary(previous => previous && { ...previous, topics: [topic, ...previous.topics.filter(item => item.id !== topic.id)] });
  }
  function addShelf(shelf: RoomShelf) {
    setLibrary(previous => previous && {
      ...previous, shelves: [...previous.shelves.filter(item => item.id !== "unsorted" && item.id !== shelf.id), shelf, unsortedShelf],
    });
  }
  function removeShelf(shelfId: string) {
    setLibrary(previous => previous && {
      shelves: previous.shelves.filter(shelf => shelf.id !== shelfId),
      topics: previous.topics.map(topic => topic.shelf === shelfId ? { ...topic, shelf: unsortedShelf.id } : topic),
    });
  }

  return <div className={styles.room}>
    {loadError ? <div className={styles.notice} role="alert">{loadError} <button type="button" className={styles.textButton} onClick={invalidate}>Try again</button></div> : null}
    {library ? <RoomView key={topicId ? `topic:${topicId}` : `shelf:${shelfId ?? ""}`} {...props} base={base} library={library}
      onBlockRefresh={setBlocked} onRefresh={invalidate} onSaveTopic={patchTopic} onSaveShelf={addShelf} onRemoveShelf={removeShelf} />
      : !loadError ? <p className={styles.hint} role="status">Opening Room to Talk…</p> : null}
  </div>;
}

function RoomView({
  base, library, revision, shelfId, topicId, partnerName, userId, onNavigate, onDirty, onExpired,
  onBlockRefresh, onRefresh, onSaveTopic, onSaveShelf, onRemoveShelf,
}: Props & {
  base: string; library: RoomLibrary; onBlockRefresh: (value: boolean) => void; onRefresh: () => void;
  onSaveTopic: (topic: RoomTopic) => void; onSaveShelf: (shelf: RoomShelf) => void; onRemoveShelf: (shelfId: string) => void;
}) {
  const [edit, setEdit] = useState<RoomEdit | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [replyDirty, setReplyDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const actionPending = useRef(false);
  const alive = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const editorFrom = useRef<HTMLElement | null>(null);
  const topic = topicId ? library.topics.find(item => item.id === topicId) : undefined;
  const shelf = library.shelves.find(item => item.id === (topic?.shelf ?? shelfId));

  useEffect(() => {
    alive.current = true;
    heading.current?.focus();
    return () => { alive.current = false; onBlockRefresh(false); onDirty(false); };
  }, [onBlockRefresh, onDirty]);
  useEffect(() => { onDirty(Boolean(edit && editDirty) || replyDirty); }, [edit, editDirty, onDirty, replyDirty]);

  const run: Run = async (work, after) => {
    if (actionPending.current) return;
    actionPending.current = true;
    onBlockRefresh(true);
    setBusy(true);
    setNotice(null);
    try {
      const result = await work();
      if (alive.current) after?.(result);
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof JourneyApiError && error.status === 401) onExpired();
      else setNotice({ error: true, text: error instanceof JourneyApiError ? error.message : "Couldn’t save that change. Please try again." });
    } finally {
      actionPending.current = false;
      if (alive.current) { setBusy(false); onBlockRefresh(false); }
      onRefresh();
    }
  };

  function browse(href: string) { if (!actionPending.current) onNavigate(href); }
  function begin(next: RoomEdit) {
    editorFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice(null);
    setEditDirty(false);
    setEdit(next);
  }
  function closeEditor() {
    setEdit(null);
    setEditDirty(false);
    onDirty(replyDirty);
    editorFrom.current?.focus();
  }
  function writeTopic(topic: RoomTopic, action: TopicAction, message: string, after?: () => void) {
    return run(() => writeRoom<RoomTopic>(`${topicPath(base, topic.id)}/state`, userId, "POST", action), saved => {
      onSaveTopic(saved);
      setNotice({ error: false, text: message });
      after?.();
    });
  }
  function save(input: RoomSubmission) {
    if (input.kind === "discuss" && topic) { void writeTopic(topic, { action: "discuss", takeaway: input.takeaway }, "Marked discussed. Its history is still here.", closeEditor); return; }
    if (input.kind === "file" && topic) {
      void run(() => writeRoom<RoomTopic>(`${topicPath(base, topic.id)}/shelf`, userId, "PUT", { shelf: input.shelf }), saved => {
        onSaveTopic(saved);
        closeEditor();
        setNotice({ error: false, text: "Moved to the new shelf." });
      });
      return;
    }
    if (input.kind === "shelf") {
      void run(() => writeRoom<RoomShelf>(`${base}/shelves`, userId, "POST", { id: input.id, name: input.name }), saved => {
        onSaveShelf(saved);
        closeEditor();
        onNavigate(roomToTalkHref({ shelf: saved.id }));
      });
    } else if (input.kind === "topic") {
      void run(() => writeRoom<RoomTopic>(`${base}/topics`, userId, "POST", { id: input.id, question: input.question, shelf: input.shelf }), saved => {
        onSaveTopic(saved);
        closeEditor();
        onNavigate(roomToTalkHref({ topic: saved.id }));
      });
    }
  }

  function setInPerson(topic: RoomTopic) {
    const saved = !topic.inPersonBy;
    void run(() => writeRoom<RoomTopic>(`${topicPath(base, topic.id)}/in-person`, userId, "PUT", { saved }), next => {
      onSaveTopic(next);
      setNotice({ error: false, text: saved ? "Saved for in person. You can still reply here." : "In-person label removed." });
    });
  }
  function deleteShelf(shelf: RoomShelf) {
    setConfirmDelete(false);
    void run(() => writeRoom<{ movedTopicCount: number }>(shelfPath(base, shelf.id), userId, "DELETE"), result => {
      onRemoveShelf(shelf.id);
      onNavigate(roomToTalkHref(result.movedTopicCount ? { shelf: unsortedShelf.id } : undefined));
    });
  }
  const feedback = notice && <p className={styles.notice} role={notice.error ? "alert" : "status"}>{notice.text}</p>;
  const editor = edit && <RoomTalkEditor key={edit.kind} edit={edit} shelves={library.shelves} busy={busy}
    onCancel={closeEditor} onChange={setEditDirty} onSave={save} />;
  const privacy = <span className={styles.private}>Only you and {partnerName}</span>;

  if (topic) {
    const path = topicPath(base, topic.id);
    const open = topic.phase === "TALK_NEXT";
    const back = shelf ?? unsortedShelf;
    return <>
      <div className={styles.toolbar}>
        <RoomLink href={roomToTalkHref({ shelf: back.id })} onNavigate={browse}>← {back.name}</RoomLink>
        {privacy}
      </div>
      <header className={styles.question} data-in-person={Boolean(topic.inPersonBy) || undefined}>
        <p className={styles.kicker}>{open ? "Opening question" : `${back.name} / Topic`}</p>
        <h1 ref={heading} tabIndex={-1}>{topic.question}</h1>
        <div className={styles.meta}><TopicPills topic={topic} />
          <span>Added by {topic.yours ? "you" : partnerName}</span>
        </div>
        {topic.inPersonBy ? <p className={styles.hint}>Saved for in person by {topic.inPersonBy === "you" ? "you" : partnerName}. You can still reply here.</p> : null}
        {topic.phase === "SUGGESTED" ? <p className={styles.hint}>{topic.suggestedBy === "you" ? `Waiting for ${partnerName}.` : `${partnerName} suggested talking about this.`}</p> : null}
      </header>
      {feedback}
      {topic.phase === "DISCUSSED" && topic.takeaway ? <section className={styles.takeaway}><h2>Our takeaway</h2><p>{topic.takeaway}</p></section> : null}
      {editor}
      {open || topic.messageCount > 0 || replyDirty ? <RoomTopicThread path={path} userId={userId} partnerName={partnerName}
        writable={open} busy={busy} revision={revision} run={run} onDirty={setReplyDirty} onExpired={onExpired} /> : null}
      <div className={styles.actions}>
        {topic.phase === "SAVED" ? <button className={styles.primary} type="button" disabled={busy || !!edit}
          onClick={() => void writeTopic(topic, { action: "suggest" }, `Suggestion sent to ${partnerName}.`)}>Suggest we talk</button> : null}
        {topic.phase === "SUGGESTED" && (topic.suggestedBy === "you" ? (
          <button className={styles.secondary} type="button" disabled={busy} onClick={() => void writeTopic(topic, { action: "withdraw" }, "Suggestion withdrawn. The topic is still on its shelf.")}>Withdraw suggestion</button>
        ) : <>
          <button className={styles.primary} type="button" disabled={busy} onClick={() => void writeTopic(topic, { action: "start" }, "Conversation opened.")}>Let’s talk</button>
          <button className={styles.secondary} type="button" disabled={busy} onClick={() => void writeTopic(topic, { action: "later" }, "Saved for later. The topic is still on its shelf.")}>Later</button>
        </>)}
        {open ? <button className={styles.secondary} type="button" disabled={busy}
          onClick={() => setInPerson(topic)}>{topic.inPersonBy ? "Remove in-person label" : "Save for in person"}</button> : null}
        {topic.phase === "SAVED" || open ? <button className={styles.secondary} type="button" disabled={busy || !!edit}
          onClick={() => begin({ kind: "discuss", takeaway: topic.takeaway })}>Mark discussed</button> : null}
        {topic.phase === "DISCUSSED" ? <button className={styles.primary} type="button" disabled={busy || !!edit}
          onClick={() => void writeTopic(topic, { action: "reopen" }, "Reopened as a saved topic.")}>Reopen topic</button> : null}
        {topic.phase !== "SUGGESTED" ? <button className={styles.textButton} type="button" disabled={busy || !!edit}
          onClick={() => begin({ kind: "file", shelf: topic.shelf })}>Move to shelf</button> : null}
      </div>
    </>;
  }

  if (topicId) return <>
    <RoomLink href={roomToTalkHref()} onNavigate={browse}>← All shelves</RoomLink>
    <h1 ref={heading} tabIndex={-1}>This topic isn’t available</h1>
    <p className={styles.hint}>Go back to Room to Talk to see what’s on your shelves.</p>
  </>;

  if (shelfId) {
    const items = shelf ? library.topics.filter(item => item.shelf === shelf.id) : [];
    return <>
      <div className={styles.toolbar}><RoomLink href={roomToTalkHref()} onNavigate={browse}>← All shelves</RoomLink>{privacy}</div>
      <header className={styles.hero}>
        <div className={styles.heroCopy}><p className={styles.kicker}>Room to Talk / Shelf</p>
          <h1 ref={heading} tabIndex={-1}>{shelf?.name ?? "This shelf isn’t available"}</h1></div>
        {shelf ? <div className={styles.actions}>
          <button className={styles.primary} type="button" disabled={busy || !!edit} onClick={() => begin({ kind: "topic", shelf: shelf.id })}>Add a topic</button>
          {shelf.id !== unsortedShelf.id ? <button className={styles.textButton} type="button" disabled={busy || !!edit}
            onClick={() => setConfirmDelete(true)}>Delete shelf</button> : null}
        </div> : null}
      </header>
      {feedback}{editor}
      {shelf ? <>
        <TopicGroup title="Talk next" topics={items.filter(item => item.phase === "TALK_NEXT")} onNavigate={browse} />
        <TopicGroup title="To talk about" topics={items.filter(item => item.phase === "SAVED" || item.phase === "SUGGESTED")} onNavigate={browse} />
        <TopicGroup title="Discussed" topics={items.filter(item => item.phase === "DISCUSSED")} onNavigate={browse} />
        {!items.length ? <p className={styles.empty}>No topics on this shelf yet. Add a question you’d like to come back to together.</p> : null}
        {shelf.id !== unsortedShelf.id ? <ConfirmDialog open={confirmDelete} title="Delete shelf?"
          description={`“${shelf.name}” will be removed for both of you. Its topics will move to Unsorted with their replies and takeaways.`}
          cancelLabel="Keep shelf" confirmLabel="Delete shelf"
          onCancel={() => setConfirmDelete(false)} onConfirm={() => deleteShelf(shelf)} /> : null}
      </> : !edit ? <p className={styles.hint}>Go back to Room to Talk to see your remaining shelves.</p> : null}
    </>;
  }

  const suggestions = library.topics.filter(item => item.phase === "SUGGESTED");
  const next = library.topics.filter(item => item.phase === "TALK_NEXT");
  return <>
    <header className={styles.hero}>
      <div className={styles.heroCopy}><p className={styles.kicker}>Together / Talk</p><h1 ref={heading} tabIndex={-1}>Room to <em>Talk.</em></h1>
        <p>Questions for later. Conversations worth coming back to.</p></div>
      <button className={styles.primary} type="button" disabled={busy || !!edit} onClick={() => begin({ kind: "topic", shelf: "unsorted" })}>Add a topic</button>
    </header>
    {privacy}
    {feedback}{editor}
    <TopicGroup title="Suggestions" topics={[...suggestions.filter(item => item.suggestedBy === "partner"), ...suggestions.filter(item => item.suggestedBy === "you")]} limit={3} onNavigate={browse} />
    <TopicGroup title="Talk next" topics={next} limit={3} onNavigate={browse} />
    <section className={styles.group} aria-label="Your shelves">
      <div className={styles.shelfHeading}><h2>Your shelves</h2>
        <button className={styles.secondary} type="button" disabled={busy || !!edit} onClick={() => begin({ kind: "shelf" })}>New shelf</button></div>
      <ul className={styles.shelves}>
        {library.shelves.map(item => {
          const topics = library.topics.filter(topic => topic.shelf === item.id);
          if (item.id === "unsorted" && !topics.length) return null;
          const discussed = topics.filter(topic => topic.phase === "DISCUSSED").length;
          return <li key={item.id}><RoomLink href={roomToTalkHref({ shelf: item.id })} onNavigate={browse}
            className={styles.shelfCard} ariaLabel={`Open ${item.name} shelf`}>
            <span aria-hidden="true" className={styles.bookcase} data-shelf={item.id}><i /><i /><i /></span>
            <span><strong>{item.name}</strong>
              <small>{topics.length} {topics.length === 1 ? "topic" : "topics"}{discussed ? ` · ${discussed} discussed` : ""}</small></span><span aria-hidden="true">›</span>
          </RoomLink></li>;
        })}
      </ul>
    </section>
  </>;
}

function RoomLink({ href, onNavigate, children, className = styles.textButton, ariaLabel }: {
  href: string; onNavigate: (href: string) => void; children: ReactNode; className?: string; ariaLabel?: string;
}) {
  return <Link href={href} className={className} aria-label={ariaLabel} onNavigate={event => { event.preventDefault(); onNavigate(href); }}>{children}</Link>;
}

function TopicPills({ topic }: { topic: TopicSummary }) {
  return <>
    <span className={styles.pill} data-phase={topic.phase}>{roomPhases[topic.phase]}</span>
    {topic.inPersonBy ? <span className={styles.pill} data-in-person>In person</span> : null}
  </>;
}

function TopicGroup({ title, topics, limit, onNavigate }: { title: string; topics: RoomTopic[]; limit?: number; onNavigate: (href: string) => void }) {
  if (!topics.length) return null;
  return <section className={styles.group} aria-label={title}>
    <h2>{title}</h2>
    <ul className={styles.topicList}>
      {(limit ? topics.slice(0, limit) : topics).map(topic => <li key={topic.id}>
        <RoomLink className={styles.topicRow} href={roomToTalkHref({ topic: topic.id })} onNavigate={onNavigate}>
          <span><strong>{topic.question}</strong><span className={styles.meta}><TopicPills topic={topic} />
            {topic.phase === "SUGGESTED" ? (topic.suggestedBy === "you" ? "Suggestion sent" : "Suggested to you") : null}</span></span><span aria-hidden="true">›</span>
        </RoomLink>
      </li>)}
    </ul>
    {limit && topics.length > limit ? <p className={styles.hint}>See the rest on your shelves.</p> : null}
  </section>;
}
