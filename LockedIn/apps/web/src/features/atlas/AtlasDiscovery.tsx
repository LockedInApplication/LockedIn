"use client";

import { useState } from "react";
import styles from "@/app/journey/journey.module.scss";
import { journeyRequest } from "@/features/journey/journey.client";
import { formatDate } from "@/features/journey/journey.utils";
import AtlasDefinitionConvergence from "./AtlasDefinitionConvergence";
import type { AtlasChapter, AtlasWord } from "./atlas.types";

export type AtlasDiscoveryProps = {
  word: AtlasWord;
  chapter: AtlasChapter;
  partnerName: string;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
  onStartAgain: () => void;
};

export default function AtlasDiscovery({
  word,
  chapter,
  partnerName,
  busy,
  runAction,
  onStartAgain,
}: AtlasDiscoveryProps) {
  const own = chapter.ownResponse!;
  const partner = chapter.partnerResponse;
  const [summary, setSummary] = useState(own.heardSummary ?? "");
  const bothConfirmed = own.heardStatus === "CONFIRMED" && partner.heardStatus === "CONFIRMED";
  const summaryNeedsWork = !own.heardSummary || own.heardStatus === "ALMOST" || own.heardStatus === "MISSING";

  return (
    <div className={styles.atlasDiscovery}>
      <section className={styles.atlasRevealHeader}>
        <span className={styles.atlasBurst}>{word.icon}</span>
        <div>
          <span className={styles.atlasStageLabel}>DUAL KEY UNLOCKED</span>
          <h3>Two meanings discovered.</h3>
          <p>Notice the shape of each answer before trying to merge them.</p>
        </div>
        <span className={styles.atlasChapterTag}>Chapter {Math.max(1, word.versionCount + (chapter.status === "SHARED" ? 0 : 1))}</span>
      </section>

      <div className={styles.atlasMeaningCards}>
        <article>
          <span>You mean</span>
          <h4>“{own.definition}”</h4>
          <div><b>Moment</b><p>{own.example}</p></div>
          <div><b>Not this</b><p>{own.notMeaning}</p></div>
        </article>
        <div className={styles.atlasBridge} aria-hidden><span>↔</span></div>
        <article>
          <span>{partnerName} means</span>
          <h4>“{partner.definition}”</h4>
          <div className={styles.atlasMysteryMoment}><b>Clue from their world</b><p>{partner.example}</p></div>
          <div><b>Not this</b><p>{partner.notMeaning}</p></div>
        </article>
      </div>

      <section className={styles.atlasChecksum}>
        <div className={styles.atlasChecksumHeader}>
          <span>◎</span>
          <div>
            <span className={styles.atlasStageLabel}>RELATIONSHIP CHECKSUM</span>
            <h3>Did the meaning arrive intact?</h3>
            <p>Understanding is complete only when the person who spoke recognizes what came back.</p>
          </div>
        </div>

        <div className={styles.atlasChecksumGrid}>
          <article>
            <span className={styles.atlasPersonLabel}>WHAT YOU HEARD FROM {partnerName.toUpperCase()}</span>
            {summaryNeedsWork ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (summary.trim().length < 8) return;
                  runAction(
                    () => journeyRequest(`/api/journey/atlas/${chapter.id}/heard`, {
                      method: "PUT",
                      body: JSON.stringify({ summary }),
                    }),
                    `Sent to ${partnerName} for a meaning check.`,
                  );
                }}
              >
                {own.heardStatus === "ALMOST" || own.heardStatus === "MISSING" ? (
                  <div className={styles.atlasGentleNudge}>
                    {own.heardStatus === "ALMOST" ? "Almost there—try one small adjustment." : "Something important was missing. Try listening for the center of it."}
                  </div>
                ) : null}
                <textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} placeholder={`What I heard ${partnerName} say is…`} />
                <button disabled={busy || summary.trim().length < 8}>{busy ? "Sending..." : "Check what I heard"}</button>
              </form>
            ) : (
              <div className={styles.atlasSummaryState}>
                <blockquote>“{own.heardSummary}”</blockquote>
                <span className={own.heardStatus === "CONFIRMED" ? styles.atlasConfirmed : ""}>
                  {own.heardStatus === "CONFIRMED" ? `✓ ${partnerName} felt understood` : `Waiting for ${partnerName} to check this`}
                </span>
              </div>
            )}
          </article>

          <article>
            <span className={styles.atlasPersonLabel}>WHAT {partnerName.toUpperCase()} HEARD FROM YOU</span>
            {!partner.heardSummary ? (
              <div className={styles.atlasListeningWait}><span>◌</span><p>{partnerName} is still putting what they heard into their own words.</p></div>
            ) : partner.heardStatus === "PENDING" ? (
              <div className={styles.atlasConfirmSummary}>
                <blockquote>“{partner.heardSummary}”</blockquote>
                <p>Does this carry the center of what you meant?</p>
                <div>
                  {(["CONFIRMED", "ALMOST", "MISSING"] as const).map((status) => (
                    <button
                      key={status}
                      disabled={busy}
                      onClick={() => runAction(
                        () => journeyRequest(`/api/journey/atlas/${chapter.id}/heard/${partner.id}/confirm`, {
                          method: "POST",
                          body: JSON.stringify({ status }),
                        }),
                        status === "CONFIRMED" ? "You confirmed that you feel understood." : "Your gentle correction was saved.",
                      )}
                    >
                      {status === "CONFIRMED" ? "Yes, that’s it" : status === "ALMOST" ? "Almost" : "Something’s missing"}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.atlasSummaryState}>
                <blockquote>“{partner.heardSummary}”</blockquote>
                <span className={partner.heardStatus === "CONFIRMED" ? styles.atlasConfirmed : ""}>
                  {partner.heardStatus === "CONFIRMED" ? "✓ You confirmed this" : `You asked ${partnerName} to try again`}
                </span>
              </div>
            )}
          </article>
        </div>
      </section>

      {chapter.status === "SHARED" ? (
        <section className={styles.atlasSharedMoment}>
          <div className={styles.atlasConfetti} aria-hidden><i>✦</i><i>●</i><i>◆</i><i>✦</i><i>●</i></div>
          <span className={styles.atlasSharedSeal}>✓</span>
          <span className={styles.atlasStageLabel}>A SHARED LANDMARK</span>
          <h3>For us, “{word.title}” means…</h3>
          <blockquote>“{chapter.sharedDefinition}”</blockquote>
          <p>This is a living definition, not a permanent verdict. You can explore it again when life changes.</p>
          <button onClick={onStartAgain} disabled={busy}>Explore a new chapter</button>
        </section>
      ) : bothConfirmed ? (
        <AtlasDefinitionConvergence
          word={word}
          chapter={chapter}
          partnerName={partnerName}
          busy={busy}
          runAction={runAction}
        />
      ) : (
        <div className={styles.atlasNotReadyYet}>
          <span>✦</span>
          <div><strong>The shared definition is still hidden.</strong><p>It opens after both people confirm they feel accurately understood.</p></div>
        </div>
      )}

      {word.previousDefinitions?.length ? (
        <details className={styles.atlasHistory}>
          <summary>Earlier meanings of “{word.title}” ({word.previousDefinitions.length})</summary>
          {word.previousDefinitions.map((item) => (
            <div key={item.id}><span>{formatDate(item.sharedAt)}</span><p>{item.definition}</p></div>
          ))}
        </details>
      ) : null}
    </div>
  );
}
