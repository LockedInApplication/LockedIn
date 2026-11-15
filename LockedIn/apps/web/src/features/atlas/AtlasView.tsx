"use client";

import { useState } from "react";
import styles from "@/app/journey/journey.module.scss";
import { initials } from "@/features/journey/journey.utils";
import AtlasLandmarkStage from "./AtlasLandmarkStage";
import AtlasHistory from "./AtlasHistory";
import type { AtlasWord } from "./atlas.types";
import AtlasChapterDialog from "./AtlasChapterDialog";
import { createPortal } from "react-dom";

export type AtlasViewProps = {
  initialWordKey?:string|null;
  targetChapterId?:string|null;
  words: AtlasWord[];
  relationshipId: string;
  partnerName: string;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
};

export default function AtlasView({
  words,
  relationshipId,
  partnerName,
  busy,
  runAction,
  initialWordKey,
  targetChapterId,
}: AtlasViewProps) {
  const suggestedWord = words.find((word) => word.chapter && word.chapter.status !== "SHARED") ?? words[0];
  const [selectedKey, setSelectedKey] = useState(initialWordKey ?? suggestedWord?.key ?? "support");
  const [targetClosed,setTargetClosed]=useState(false);
  const selectedWord = words.find((word) => word.key === selectedKey) ?? words[0];
  const completedCount = words.filter((word) => word.versionCount > 0).length;

  if (!selectedWord) return null;

  return (
    <section className={styles.atlasShell} aria-labelledby="atlas-title">
      <header className={styles.atlasHero}>
        <div>
          <span className={styles.atlasKicker}>THE ATLAS OF US</span>
          <h2 id="atlas-title">Same word. Two worlds. One meaning you build together.</h2>
          <p>
            Explore the everyday words that quietly shape a relationship. Each landmark opens
            privately and completes only when you both feel accurately understood.
          </p>
        </div>
        <div className={styles.atlasCompass} aria-label={`${completedCount} of ${words.length} landmarks explored`}>
          <span>✦</span>
          <strong>{completedCount}/{words.length}</strong>
          <small>shared landmarks</small>
        </div>
      </header>

      <div className={styles.atlasMap}>
        <svg className={styles.atlasTrail} viewBox="0 0 900 310" preserveAspectRatio="none" aria-hidden>
          <path d="M92 232 C215 52 330 56 443 166 C552 274 672 269 808 72" pathLength="100" />
          <path
            className={styles.atlasTrailProgress}
            d="M92 232 C215 52 330 56 443 166 C552 274 672 269 808 72"
            pathLength="100"
            style={{ strokeDashoffset: 100 - (completedCount / Math.max(words.length, 1)) * 100 }}
          />
        </svg>
        <div className={styles.atlasCloudOne} aria-hidden>☁</div>
        <div className={styles.atlasCloudTwo} aria-hidden>☁</div>
        {words.map((word, index) => {
          const active = word.key === selectedWord.key;
          const complete = word.versionCount > 0 || word.chapter?.status === "SHARED";
          const inProgress = Boolean(word.chapter && word.chapter.status !== "SHARED");
          return (
            <button
              key={word.key}
              className={`${styles.atlasLandmark} ${styles[`atlasLandmark_${index}`]} ${active ? styles.atlasLandmarkActive : ""} ${complete ? styles.atlasLandmarkComplete : ""}`}
              onClick={() => setSelectedKey(word.key)}
              aria-current={active ? "step" : undefined}
            >
              <span className={`${styles.atlasLandmarkNode} ${styles[`atlasColor_${word.color}`]}`}>
                <i>{complete ? "✓" : word.icon}</i>
                {inProgress ? <b className={styles.atlasPulse} aria-hidden /> : null}
              </span>
              <strong>{word.title}</strong>
              <small>{complete && inProgress ? "Shared · new chapter in progress" : complete ? "Shared" : inProgress ? "In progress" : "Unexplored"}</small>
            </button>
          );
        })}
        <div className={styles.atlasPairToken} aria-hidden>
          <span>Y</span><span>{initials(partnerName)}</span>
        </div>
      </div>

      <AtlasHistory word={selectedWord} />
      {!targetClosed && targetChapterId && (selectedWord.chapter?.id===targetChapterId && selectedWord.chapter.status==="SHARED" || selectedWord.previousDefinitions?.some(c=>c.id===targetChapterId)) ? createPortal(
        <AtlasChapterDialog chapterId={targetChapterId} wordTitle={selectedWord.title} onClose={()=>setTargetClosed(true)}/>,document.body,
      ):null}

      <AtlasLandmarkStage
        key={`${selectedWord.key}-${selectedWord.chapter?.id ?? "new"}-${selectedWord.chapter?.status ?? "empty"}-${selectedWord.chapter?.candidateVersion ?? 0}`}
        word={selectedWord}
        relationshipId={relationshipId}
        partnerName={partnerName}
        busy={busy}
        runAction={runAction}
      />
    </section>
  );
}
