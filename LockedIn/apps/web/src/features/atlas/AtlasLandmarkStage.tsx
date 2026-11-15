"use client";

import styles from "@/app/journey/journey.module.scss";
import { journeyRequest } from "@/features/journey/journey.client";
import AtlasDiscovery from "./AtlasDiscovery";
import AtlasPrivateForm from "./AtlasPrivateForm";
import type { AtlasWord } from "./atlas.types";

export type AtlasLandmarkStageProps = {
  word: AtlasWord;
  relationshipId: string;
  partnerName: string;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
};

export default function AtlasLandmarkStage({
  word,
  relationshipId,
  partnerName,
  busy,
  runAction,
}: AtlasLandmarkStageProps) {
  const chapter = word.chapter;
  const startChapter = () =>
    runAction(
      () => journeyRequest(`/api/journey/relationships/${relationshipId}/atlas/${encodeURIComponent(word.key)}`, { method: "POST" }),
      `Your ${word.title.toLowerCase()} landmark is open. Begin privately.`,
    );

  if (!chapter) {
    return (
      <article className={`${styles.atlasStage} ${styles[`atlasStage_${word.color}`]}`}>
        <div className={styles.atlasStageIcon}>{word.icon}</div>
        <div className={styles.atlasStageIntro}>
          <span>LANDMARK · {word.title.toUpperCase()}</span>
          <h3>{word.description}</h3>
          <p>
            You will each define this privately. Neither answer opens until both are ready,
            and no shared meaning is saved without two yeses.
          </p>
          <div className={styles.atlasMiniSteps}>
            <span><b>1</b> Define</span><i />
            <span><b>2</b> Discover</span><i />
            <span><b>3</b> Confirm</span><i />
            <span><b>4</b> Share</span>
          </div>
          <button className={styles.atlasPrimary} disabled={busy} onClick={startChapter}>
            {busy ? "Opening..." : `Explore “${word.title}”`}
          </button>
        </div>
      </article>
    );
  }

  if (!chapter.ownResponse) {
    return <AtlasPrivateForm word={word} chapter={chapter} busy={busy} runAction={runAction} />;
  }

  if (!chapter.partnerResponse.submitted) {
    return (
      <article className={styles.atlasStage}>
        <div className={styles.atlasWaitingOrb}><span>✓</span><i /></div>
        <div className={styles.atlasWaitingCopy}>
          <span className={styles.atlasStageLabel}>YOUR MEANING IS SAFE</span>
          <h3>Your side of “{word.title}” is ready.</h3>
          <p>
            The discovery stays locked until {partnerName} adds their private meaning. They
            cannot see yours yet—and you cannot see theirs.
          </p>
          <div className={styles.atlasDualKey}>
            <span className={styles.atlasKeyReady}>You <b>✓</b></span>
            <i>＋</i>
            <span>{partnerName} <b>…</b></span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <AtlasDiscovery
      word={word}
      chapter={chapter}
      partnerName={partnerName}
      busy={busy}
      runAction={runAction}
      onStartAgain={startChapter}
    />
  );
}
