"use client";

import { useEffect, useId, useRef, useState } from "react";
import { journeyRequest } from "@/features/journey/journey.client";
import type { AtlasCompletedChapter } from "./atlas.types";
import AtlasChapterContent from "./AtlasChapterContent";
import chapterStyles from "./atlas-chapter.module.scss";

type ChapterState =
  | { status: "loading" }
  | { status: "ready"; chapter: AtlasCompletedChapter }
  | { status: "error"; message: string };

export default function AtlasChapterDialog({ chapterId, wordTitle, onClose }: {
  chapterId: string;
  wordTitle: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, setState] = useState<ChapterState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    journeyRequest<AtlasCompletedChapter>(`/api/journey/atlas/${encodeURIComponent(chapterId)}`, { signal: controller.signal })
      .then((chapter) => {
        if (!controller.signal.aborted) setState({ status: "ready", chapter });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: error instanceof Error ? error.message : "We could not open this chapter." });
        }
      });
    return () => controller.abort();
  }, [chapterId, attempt]);

  return (
    <dialog ref={dialog} className={chapterStyles.dialog} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className={chapterStyles.surface}>
        <header className={chapterStyles.header}>
          <div>
            <span className={chapterStyles.eyebrow}>THE ATLAS OF US · COMPLETED CHAPTER</span>
            <h2 id={titleId}>{wordTitle}, in your own words</h2>
          </div>
          <button type="button" className={chapterStyles.closeButton} onClick={onClose} aria-label="Close full chapter">×</button>
        </header>

        {state.status === "loading" ? (
          <div className={chapterStyles.message} role="status"><span aria-hidden>✦</span><p>Opening your shared chapter…</p></div>
        ) : state.status === "error" ? (
          <div className={chapterStyles.message}>
            <p role="alert">{state.message}</p>
            <button type="button" className={chapterStyles.viewButton} onClick={() => {
              setState({ status: "loading" });
              setAttempt((current) => current + 1);
            }}>Try again</button>
          </div>
        ) : <AtlasChapterContent chapter={state.chapter} />}
      </div>
    </dialog>
  );
}
